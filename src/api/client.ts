import { cacheExchange, Client, fetchExchange, mapExchange } from '@urql/core'
import { authExchange } from '@urql/exchange-auth'

import { CTX_USER_AUTHORIZATION, ENDPOINT, requiresAuth } from '@/api/endpoints'
import { isAuthExpired, isRefreshRaceRetry, isSessionGone, isTransportFailure } from '@/api/errors'
import { RefreshDocument } from '@/api/operations/userAuthorization/refresh'
import { createRefreshBreaker } from '@/api/refreshBreaker'
import { clearAccessToken, getAccessToken, setAccessToken } from '@/api/tokenStore'

/**
 * How many times a `refresh` refused with `REFRESH_RACE_RETRY` is sent again before the session is treated
 * as lost. Retries, not attempts: the first send is not one, so this is three calls at worst.
 */
const REFRESH_RACE_RETRIES = 2

/**
 * Thrown instead of calling `utils.mutate` while the breaker's cooldown window is open.
 *
 * `@urql/exchange-auth` turns a `refreshAuth` rejection into a `CombinedError` carrying this as
 * `networkError`, for every operation currently queued behind the refresh — the exact shape a real
 * transport failure produces — without a fetch ever going out. See the comment on `refreshAuth` below.
 */
const REFRESH_SUSPENDED = 'Refresh suspended after repeated transport failures'

export interface CreateGraphQLClientOptions {
	/**
	 * Called when the refresh mutation cannot mint a new access token, or when an operation comes back
	 * with a terminal session status. The session is over.
	 *
	 * Kept as a callback rather than a router import so the API layer stays independent of TanStack
	 * Router, and so a test can observe it directly. On this app it does **not** navigate to the login
	 * page: a customer whose session expired while reading a shop page should keep reading the shop
	 * page. It clears the session and lets the private routes' own guard redirect if the visitor is
	 * standing on one.
	 */
	onSessionLost: () => void

	/**
	 * The clock the refresh breaker reads to open and check its cooldown window. Defaults to `Date.now`;
	 * a test overrides it to make the breaker's timing deterministic instead of racing the real clock.
	 */
	now?: (() => number) | undefined

	/**
	 * Passed through to the refresh breaker, which owns the `window.addEventListener('online', …)` it
	 * registers. Production callers pass nothing: the client, and therefore the breaker, lives as long as
	 * the page. A test that builds a client per test passes a per-test `AbortController`'s signal and
	 * aborts it in teardown — otherwise the listener accumulates on the one jsdom `window` the whole
	 * suite shares, one per client ever built.
	 */
	signal?: AbortSignal | undefined
}

/**
 * The browser's urql client. One per page load, created in `src/router.tsx`.
 *
 * ⚠️ **This module is client-only.** It closes over the module-scoped access token, which on a server
 * would be shared by every concurrent request. Server rendering uses `createSsrClient` in
 * src/api/ssr.ts, which builds a fresh client per request and has no auth exchange at all.
 *
 * `cacheExchange` is the document cache, not Graphcache: results are keyed by query + variables, and a
 * mutation invalidates every cached query that returned one of the `__typename`s the mutation touched.
 * That falls down in exactly one case — a mutation whose response mentions no typename of the list it
 * changed — and **every** mutation in the private area is that case, since they answer `Boolean` or
 * `OnlyIdType`. Each call site names the affected types through `additionalTypenames`.
 *
 * `fetchOptions.credentials: 'include'` is what carries the refresh cookie. It works because the app
 * and the services share one origin; see the comment in vite.config.ts.
 */
export const createGraphQLClient = ({ onSessionLost, now, signal }: CreateGraphQLClientOptions): Client => {
	// One breaker per client, i.e. per browser page load — never a module-scoped variable. See the doc
	// comment on `createRefreshBreaker` for why that matters on an app that also builds urql clients for SSR.
	const refreshBreaker = createRefreshBreaker({ now, signal })

	return new Client({
		/**
		 * The default endpoint is the **public** catalogue, not the authenticated one — the opposite of
		 * the two sibling apps. Most of what this app sends is anonymous, and a document that forgets its
		 * `CTX_*` then lands on a service that answers it rather than on one that 401s.
		 */
		url: ENDPOINT.publicResource,
		fetchOptions: { credentials: 'include' },
		/**
		 * POST for queries too, against urql's default of `'within-url-limit'`.
		 *
		 * Every service constructs its `ApolloServer` with `csrfPrevention: true`, which rejects a GET
		 * that carries none of the preflight-forcing headers (`apollo-require-preflight`,
		 * `x-apollo-operation-name`) — and urql sends none of them. Left at the default, every query short
		 * enough to fit in a URL comes back as "This operation has been blocked as a potential Cross-Site
		 * Request Forgery" while mutations work, which reads as a schema problem.
		 *
		 * It is also the right call independently of Apollo: `credentials: 'include'` plus a GET is the
		 * exact shape CSRF prevention exists to stop, and a query string ends up in nginx access logs and
		 * in browser history — a customer's search terms and their address would both be logged.
		 */
		preferGetMethod: false,
		exchanges: [
			cacheExchange,
			authExchange(async (utils) => ({
				addAuthToOperation(operation) {
					const token = getAccessToken()
					if (token === null) return operation

					// `Bearer access:<token>` — the `access:` prefix is part of the Redis key the backend
					// looks the token up under, not decoration. Without it the lookup misses and the service
					// answers 498.
					return utils.appendHeaders(operation, { Authorization: `Bearer access:${token}` })
				},

				/**
				 * Refresh *before* sending, when there is no token to send and the endpoint needs one.
				 *
				 * This is the whole page-reload story: the access token lives in memory, a reload wipes it,
				 * and the first authenticated operation after the reload silently re-mints it from the
				 * httpOnly cookie instead of bouncing the customer to the login page.
				 *
				 * ⚠️ `requiresAuth` returning true for an anonymous endpoint would be a bad failure here,
				 * not a harmless one: every anonymous visitor's first catalogue query would fire a refresh
				 * that cannot succeed, and the failed refresh calls `onSessionLost`. See src/api/endpoints.ts.
				 */
				willAuthError(operation) {
					return getAccessToken() === null && requiresAuth(operation.context.url)
				},

				/** 498 is the platform's "access token expired or deleted". Nothing else is retryable. */
				didAuthError(error) {
					return isAuthExpired(error)
				},

				/**
				 * Mint a new access token from the refresh cookie, retrying the one failure that is not a
				 * failure.
				 *
				 * Two tabs reloading at the same moment both send the same refresh cookie. One wins and
				 * rotates it; the other presents a token the backend consumed milliseconds ago, and inside
				 * the grace window it answers `REFRESH_RACE_RETRY` instead of revoking the family. By then
				 * the winner's `Set-Cookie` is in the jar both tabs share, so the retry sends the current
				 * token and succeeds — which is why there is no backoff *here*: the thing being waited for
				 * has already happened, and a timer would only delay the customer's first screen. That is a
				 * different failure from the one `refreshBreaker` guards below: this loop is bounded at
				 * `REFRESH_RACE_RETRIES` because it is otherwise unbounded on a backend that keeps answering
				 * the same code. Two is a race lost twice in a row; a third is not a race any more, and
				 * clearing the session is the honest answer.
				 *
				 * ⚠️ During a sustained outage every operation that hits an expired token lands here, and
				 * without the breaker each one would fire its own `mutate` at a refresh endpoint that is
				 * already down. `refreshBreaker` tracks *consecutive transport failures* — the mutation never
				 * got a response at all, as opposed to the backend answering with one — and once the cooldown
				 * window it opens is active, this returns without a network call by throwing instead of
				 * awaiting `utils.mutate`. `@urql/exchange-auth` turns that rejection into the same
				 * `CombinedError` shape a real transport failure produces for every operation queued behind
				 * this refresh, so the session survives and the caller sees a network error exactly as it
				 * would on any other dropped connection.
				 *
				 * A transport failure is deliberately never terminal here, unlike a failure the backend
				 * itself answered: the visitor's connection dropping is not evidence the refresh cookie is
				 * bad, and signing them out over it would turn a reconnect into an unexplained logout.
				 */
				async refreshAuth() {
					if (refreshBreaker.isOpen()) throw new Error(REFRESH_SUSPENDED)

					for (let attempt = 0; attempt <= REFRESH_RACE_RETRIES; attempt++) {
						const result = await utils.mutate(RefreshDocument, {}, CTX_USER_AUTHORIZATION)
						const refresh = result.data?.refresh

						if (refresh !== undefined && refresh.status && refresh.accessToken !== '') {
							setAccessToken(refresh.accessToken)
							refreshBreaker.recordSuccess()
							return
						}

						if (isTransportFailure(result.error)) {
							refreshBreaker.recordFailure()
							throw result.error
						}

						// Every other failure is terminal: a second attempt would present the same cookie to a
						// backend that has already refused it.
						if (!isRefreshRaceRetry(result.error)) break
					}

					clearAccessToken()
					onSessionLost()
				}
			})),

			/**
			 * The other way a session ends.
			 *
			 * `authExchange` only knows about 498, because 498 is the only status a refresh can fix. The
			 * three in `isSessionGone` — 401 no session, 412 account disabled/deleted, 499 token required —
			 * are terminal, and they arrive on ordinary domain operations rather than on the refresh.
			 * Without this the customer would sit on a screen showing a red alert, still nominally signed
			 * in, with every subsequent action failing the same way.
			 *
			 * Placed below `authExchange` in the chain, so results reach it on the way back up before the
			 * retry logic sees them. A 498 passes straight through — it is not in `SESSION_GONE`, and
			 * whether to retry it is `authExchange`'s decision, not this one's.
			 */
			mapExchange({
				onError(error) {
					if (!isSessionGone(error)) return

					clearAccessToken()
					onSessionLost()
				}
			}),
			fetchExchange
		]
	})
}
