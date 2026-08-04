import { cacheExchange, Client, fetchExchange, mapExchange } from '@urql/core'
import { authExchange } from '@urql/exchange-auth'

import { CTX_USER_AUTHORIZATION, ENDPOINT, requiresAuth } from '@/api/endpoints'
import { isAuthExpired, isSessionGone } from '@/api/errors'
import { RefreshDocument } from '@/api/operations/userAuthorization/refresh'
import { clearAccessToken, getAccessToken, setAccessToken } from '@/api/tokenStore'

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
export const createGraphQLClient = ({ onSessionLost }: CreateGraphQLClientOptions): Client =>
	new Client({
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

				async refreshAuth() {
					const result = await utils.mutate(RefreshDocument, {}, CTX_USER_AUTHORIZATION)
					const refresh = result.data?.refresh

					if (refresh !== undefined && refresh.status && refresh.accessToken !== '') {
						setAccessToken(refresh.accessToken)
						return
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
