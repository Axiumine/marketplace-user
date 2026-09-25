import type { Client, OperationContext, TypedDocumentNode } from '@urql/core'
import { gql } from '@urql/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createGraphQLClient } from '@/api/client'
import { CTX_LOGOUT, CTX_PUBLIC_RESOURCE, CTX_USER_RESOURCE, ENDPOINT } from '@/api/endpoints'
import { HTTP } from '@/api/errors'
import { clearAccessToken, getAccessToken, setAccessToken } from '@/api/tokenStore'

import { clock } from '../helpers/clock'
import type { GraphQLReplies } from '../helpers/graphql'
import { graphQLError, stubGraphQL } from '../helpers/graphql'
import { installOnlineListenerGuard } from '../helpers/onlineListenerGuard'

interface Me {
	readonly me: { readonly email: string } | null
}

const MeDocument = gql`
	query Me {
		me {
			email
		}
	}
` as TypedDocumentNode<Me, Record<string, never>>

const ShopsDocument = gql`
	query Shops {
		shops {
			slug
		}
	}
` as TypedDocumentNode<{ readonly shops: readonly { readonly slug: string }[] }, Record<string, never>>

/** The reply the refresh mutation gives when it worked. */
const refreshed = (accessToken = 'fresh-token') => ({ data: { refresh: { status: true, accessToken } } })

const ME = { data: { me: { email: 'customer@marketplace.it' } } }

/**
 * What the backend answers the loser of a multi-tab refresh race: a 409 carrying the one
 * `extensions.code` on the platform, and no token of any kind — the grace branch mints nothing.
 */
const raceLost = {
	errors: [graphQLError('Refresh In Progress', 'Retry with the current cookie.', 409, 'REFRESH_RACE_RETRY')],
	status: 409
}

/**
 * One `AbortController` per client this file builds without an explicit `signal`, aborted in `afterEach`.
 *
 * `createGraphQLClient` registers a `window.addEventListener('online', …)` through its refresh breaker
 * that otherwise outlives the test — this file builds one client per test (mostly through `clientWith`,
 * plus the two direct `createGraphQLClient` calls at the bottom), and without this the listener
 * accumulates on the one jsdom `window` the whole suite shares.
 */
const clientControllers = new Set<AbortController>()

const trackedSignal = (): AbortSignal => {
	const controller = new AbortController()
	clientControllers.add(controller)

	return controller.signal
}

afterEach(() => {
	for (const controller of clientControllers) controller.abort()
	clientControllers.clear()
})

installOnlineListenerGuard()

const clientWith = (replies: GraphQLReplies, now?: () => number, signal?: AbortSignal) => {
	const onSessionLost = vi.fn()
	const stub = stubGraphQL(replies)

	return { client: createGraphQLClient({ onSessionLost, now, signal: signal ?? trackedSignal() }), onSessionLost, stub }
}

const names = (stub: ReturnType<typeof stubGraphQL>) => stub.calls.map((call) => call.operationName)

describe('the transport', () => {
	/*
	 * ⚠️ The default endpoint is the **public** catalogue, the opposite of the two sibling apps. Most of
	 * what this app sends is anonymous, so a document that forgets its `CTX_*` lands on a service that
	 * answers it rather than on one that 401s — and a 401 on a catalogue page is a blank shop.
	 */
	it('defaults to the public catalogue endpoint', async () => {
		const { client, stub } = clientWith({ Shops: { data: { shops: [] } } })
		await client.query(ShopsDocument, {}).toPromise()

		expect(stub.calls[0]?.url).toBe(ENDPOINT.publicResource)
	})

	it('routes an operation to the endpoint its context names', async () => {
		const { client, stub } = clientWith({ Me: ME })
		setAccessToken('token')
		await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(stub.calls[0]?.url).toBe(ENDPOINT.userResource)
	})

	/*
	 * `credentials: 'include'` is what carries the refresh cookie, and it works only because the app and
	 * the services share one origin — the cookie is httpOnly and same-site and cannot cross one.
	 */
	it('sends the refresh cookie with every request', async () => {
		const { client, stub } = clientWith({ Shops: { data: { shops: [] } } })
		await client.query(ShopsDocument, {}, CTX_PUBLIC_RESOURCE).toPromise()

		expect(stub.calls[0]?.credentials).toBe('include')
	})

	/*
	 * ⚠️ POST for queries too, against urql's default of `'within-url-limit'`. Every service constructs
	 * its `ApolloServer` with `csrfPrevention: true`, which rejects a GET carrying none of the
	 * preflight-forcing headers — and urql sends none of them. At the default, every query short enough to
	 * fit in a URL comes back as a CSRF message while mutations work, which reads as a schema problem.
	 *
	 * It is also right independently of Apollo: a GET plus `credentials: 'include'` is the exact shape
	 * CSRF prevention exists to stop, and the query string lands in nginx access logs and browser history
	 * — where a customer's search terms and their address would both be recorded.
	 */
	it('posts even the shortest query', async () => {
		const { client, stub } = clientWith({ Shops: { data: { shops: [] } } })
		await client.query(ShopsDocument, {}, CTX_PUBLIC_RESOURCE).toPromise()

		expect(stub.calls[0]?.method).toBe('POST')
		expect(stub.calls[0]?.url).not.toContain('?query=')
	})

	// The document cache, keyed by query + variables. Not Graphcache: a mutation invalidates by
	// `__typename`, which is why every mutation in the private area passes `additionalTypenames`.
	it('serves a repeated query from the document cache', async () => {
		const { client, stub } = clientWith({ Shops: { data: { shops: [] } } })
		await client.query(ShopsDocument, {}, CTX_PUBLIC_RESOURCE).toPromise()
		await client.query(ShopsDocument, {}, CTX_PUBLIC_RESOURCE).toPromise()

		expect(stub.calls).toHaveLength(1)
	})
})

describe('the access token', () => {
	/*
	 * ⚠️ `Bearer access:<token>`. The `access:` prefix is part of the Redis key the backend looks the token
	 * up under, not decoration — without it the lookup misses and the service answers 498, which the auth
	 * exchange then tries to fix by refreshing, producing an infinite refresh loop on a perfectly valid
	 * token.
	 */
	it('sends the token with the prefix the Redis lookup needs', async () => {
		const { client, stub } = clientWith({ Me: ME })
		setAccessToken('abc123')
		await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(stub.calls[0]?.authorization).toBe('Bearer access:abc123')
	})

	/*
	 * ⚠️ No token on an anonymous endpoint — and no refresh either. `requiresAuth` listing a public
	 * endpoint as authenticated would make every anonymous visitor's first catalogue query fire a refresh
	 * that cannot succeed, and the failed refresh calls `onSessionLost`.
	 */
	it('sends nothing and refreshes nothing for an anonymous visitor', async () => {
		const { client, stub, onSessionLost } = clientWith({ Shops: { data: { shops: [] } } })
		await client.query(ShopsDocument, {}, CTX_PUBLIC_RESOURCE).toPromise()

		expect(stub.calls[0]?.authorization).toBeNull()
		expect(names(stub)).toEqual(['Shops'])
		expect(onSessionLost).not.toHaveBeenCalled()
	})

	// A signed-in customer's token goes to the public endpoints too. It costs nothing, and the alternative
	// — stripping it per endpoint — is a branch that gets the list wrong in the other direction.
	it('still sends the token on an anonymous endpoint when there is one', async () => {
		const { client, stub } = clientWith({ Shops: { data: { shops: [] } } })
		setAccessToken('abc123')
		await client.query(ShopsDocument, {}, CTX_PUBLIC_RESOURCE).toPromise()

		expect(stub.calls[0]?.authorization).toBe('Bearer access:abc123')
	})
})

describe('the refresh before sending', () => {
	/*
	 * The whole page-reload story. The access token lives in memory, a reload wipes it, and the first
	 * authenticated operation after the reload silently re-mints it from the httpOnly cookie instead of
	 * bouncing the customer to a login page they were already past.
	 */
	it('refreshes first when there is no token and the endpoint needs one', async () => {
		const { client, stub } = clientWith({ Refresh: refreshed(), Me: ME })
		const result = await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(names(stub)).toEqual(['Refresh', 'Me'])
		expect(stub.calls[1]?.authorization).toBe('Bearer access:fresh-token')
		expect(result.data).toEqual(ME.data)
	})

	// The refresh goes to the User tier's token service on 4031, not to the resource endpoint — the other
	// two tiers' services are identical in shape and would each refuse this cookie with a 403.
	it('sends the refresh to the user tier token service', async () => {
		const { client, stub } = clientWith({ Refresh: refreshed(), Me: ME })
		await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(stub.calls[0]?.url).toBe(ENDPOINT.userAuthorization)
	})

	it('keeps the freshly minted token for the next operation', async () => {
		const { client } = clientWith({ Refresh: refreshed(), Me: ME })
		await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(getAccessToken()).toBe('fresh-token')
	})

	it('does not refresh when there is already a token', async () => {
		const { client, stub } = clientWith({ Me: ME })
		setAccessToken('abc123')
		await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(names(stub)).toEqual(['Me'])
	})

	// Logout is an authenticated endpoint: the resolver deletes the Redis keys by token content, so it
	// needs the token it is about to invalidate.
	it('refreshes before logout too, since logout needs a token to delete', async () => {
		const { client, stub } = clientWith({ Refresh: refreshed(), Logout: { data: { logout: true } } })
		const LogoutDocument = gql`
			mutation Logout {
				logout
			}
		` as TypedDocumentNode<{ readonly logout: boolean }, Record<string, never>>

		await client.mutation(LogoutDocument, {}, CTX_LOGOUT).toPromise()

		expect(names(stub)).toEqual(['Refresh', 'Logout'])
	})
})

describe('the refresh that cannot succeed', () => {
	/*
	 * Three shapes of failure, all meaning the same thing: the refresh cookie is gone, expired, or was
	 * minted for a session the backend has since dropped. Each one has to end the session rather than
	 * leave a customer signed in with a token that is not there.
	 */
	it.each([
		['the mutation reports failure', { data: { refresh: { status: false, accessToken: '' } } }],
		['the token comes back empty', { data: { refresh: { status: true, accessToken: '' } } }],
		['there is no refresh field at all', { data: {} }],
		['the mutation errors', { errors: [graphQLError('Unauthorized', undefined, HTTP.unauthorized)], status: 401 }]
	])('ends the session when %s', async (_label, reply) => {
		const { client, onSessionLost } = clientWith({ Refresh: reply, Me: ME })
		await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		// The token store stays empty: a refresh that did not mint one must not leave a half-set session
		// behind for the next operation to send.
		expect(getAccessToken()).toBeNull()
		expect(onSessionLost).toHaveBeenCalled()
	})

	/*
	 * ⚠️ `onSessionLost` does **not** navigate on this app, unlike the two sibling SPAs. A customer whose
	 * session expired while reading a shop page should keep reading the shop page; it clears the session
	 * and lets the private routes' own guard redirect only if the visitor is standing on one.
	 *
	 * That is a decision the callback owns, so all this file can assert is that the callback is what gets
	 * called — and that nothing here reaches for the router.
	 */
	it('hands the decision to the callback rather than navigating', async () => {
		const { client, onSessionLost } = clientWith({
			Refresh: { data: { refresh: { status: false, accessToken: '' } } },
			Me: ME
		})
		await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(onSessionLost).toHaveBeenCalledTimes(1)
		expect(window.location.pathname).toBe('/')
	})
})

describe('the retry on 498', () => {
	/*
	 * ⚠️ 498 is the platform's "access token expired or deleted from Redis", and it is the only status a
	 * refresh can fix. The refresh cookie is still valid — this is a customer who left a tab open past the
	 * access token's lifetime, which is every long session there is.
	 */
	it('refreshes and retries the operation that got a 498', async () => {
		const { client, stub } = clientWith({
			Me: [{ errors: [graphQLError('Invalid Token', undefined, HTTP.invalidToken)], status: 498 }, ME],
			Refresh: refreshed('second-token')
		})
		setAccessToken('expired')

		const result = await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(names(stub)).toEqual(['Me', 'Refresh', 'Me'])
		expect(stub.calls[2]?.authorization).toBe('Bearer access:second-token')
		expect(result.data).toEqual(ME.data)
		expect(result.error).toBeUndefined()
	})

	// The retry is not free: if the refresh fails the session is over, and the customer must not be left
	// on a screen that keeps retrying the same expired token.
	it('ends the session when the refresh behind a 498 fails', async () => {
		const { client, onSessionLost, stub } = clientWith({
			Me: { errors: [graphQLError('Invalid Token', undefined, HTTP.invalidToken)], status: 498 },
			Refresh: { data: { refresh: { status: false, accessToken: '' } } }
		})
		setAccessToken('expired')

		await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(getAccessToken()).toBeNull()
		expect(onSessionLost).toHaveBeenCalled()
		// Sent once. The retry loop is for the lost race and nothing else: re-sending a cookie
		// the backend has already refused would triple the cost of every genuine expiry.
		expect(names(stub).filter((name) => name === 'Refresh')).toHaveLength(1)
	})

	it.each([HTTP.badRequest, HTTP.forbidden, HTTP.internal])('does not retry a %i', async (status) => {
		const { client, stub } = clientWith({ Me: { errors: [graphQLError('Boom', undefined, status)], status } })
		setAccessToken('abc123')

		await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(names(stub)).toEqual(['Me'])
	})
})

/*
 * The whole point of the grace window. Several tabs of one catalogue are the normal way this app
 * is read, they reload together, and they share one cookie jar — so one of them loses the rotation race on
 * a regular day. The loser must not be signed out, and the family it belongs to must not be revoked: the
 * backend answers a code of its own, and the client sends the refresh again with the cookie the winner has
 * by then written into the jar.
 */
describe('the lost refresh race', () => {
	it('retries the refresh and keeps the session', async () => {
		const { client, onSessionLost, stub } = clientWith({
			Me: [{ errors: [graphQLError('Invalid Token', undefined, HTTP.invalidToken)], status: 498 }, ME],
			Refresh: [raceLost, refreshed('second-token')]
		})
		setAccessToken('expired')

		const result = await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(names(stub)).toEqual(['Me', 'Refresh', 'Refresh', 'Me'])
		expect(result.data).toEqual(ME.data)
		expect(getAccessToken()).toBe('second-token')
		expect(onSessionLost).not.toHaveBeenCalled()
	})

	// Two retries, not one: with several tabs open a single one can lose twice in a row, and the second
	// retry is the difference between a customer reading on and a customer sent back to the login form.
	it('retries a second time and still keeps the session', async () => {
		const { client, onSessionLost, stub } = clientWith({
			Me: [{ errors: [graphQLError('Invalid Token', undefined, HTTP.invalidToken)], status: 498 }, ME],
			Refresh: [raceLost, raceLost, refreshed('second-token')]
		})
		setAccessToken('expired')

		const result = await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(names(stub).filter((name) => name === 'Refresh')).toHaveLength(3)
		expect(result.data).toEqual(ME.data)
		expect(getAccessToken()).toBe('second-token')
		expect(onSessionLost).not.toHaveBeenCalled()
	})

	// And it stops. A backend answering the same code forever is not a race any more, and a client that
	// keeps asking would drive itself into the refresh endpoint's own rate limiter.
	it('gives up after two retries and clears the session', async () => {
		const { client, onSessionLost, stub } = clientWith({
			Me: { errors: [graphQLError('Invalid Token', undefined, HTTP.invalidToken)], status: 498 },
			Refresh: raceLost
		})
		setAccessToken('expired')

		await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(names(stub).filter((name) => name === 'Refresh')).toHaveLength(3)
		expect(getAccessToken()).toBeNull()
		expect(onSessionLost).toHaveBeenCalled()
	})
})

/*
 * During a sustained outage every operation that hits an expired token calls `refreshAuth`, and without a
 * breaker each one fires its own `mutate` at a refresh endpoint that is already down. These tests exercise
 * that breaker through the real client rather than through `refreshBreaker.test.ts`'s direct unit tests —
 * the wiring is what could still be wrong even with a correct breaker underneath it.
 */
describe('the refresh transport breaker', () => {
	/** A refresh mutation that never reaches the server — no response, no status, offline. */
	const failingRefresh = { networkError: 'offline' }

	/*
	 * `network-only`, throughout this block: several tests query `Me` more than once, and a `Me` that ever
	 * succeeds — the resend after a terminal refresh failure, or after the breaker resets — would otherwise
	 * be served from `cacheExchange` on every later call, bypassing `authExchange` and the breaker under
	 * test entirely. Every call here is meant to reach the network.
	 */
	const meContext: Partial<OperationContext> = { ...CTX_USER_RESOURCE, requestPolicy: 'network-only' }

	/*
	 * ⚠️ The bug this breaker closes. Before it, a refresh that never reached the server was funnelled
	 * through the same "every other failure is terminal" branch as a refusal the backend actually sent,
	 * and the session ended over a dropped connection — the one case where the refresh cookie was never
	 * shown to be bad at all.
	 */
	it('keeps the session and fails the operation as a network error, not a logout', async () => {
		const { client, onSessionLost, stub } = clientWith({ Me: ME, Refresh: failingRefresh })

		const result = await client.query(MeDocument, {}, meContext).toPromise()

		expect(names(stub)).toEqual(['Refresh'])
		expect(onSessionLost).not.toHaveBeenCalled()
		expect(getAccessToken()).toBeNull()
		expect(result.error).toBeDefined()
		expect(result.data).toBeUndefined()
	})

	it('makes no refresh call for an operation that lands inside the cooldown window the first failure opened', async () => {
		const time = clock()
		const { client, stub } = clientWith({ Me: ME, Refresh: failingRefresh }, time.now)

		await client.query(MeDocument, {}, meContext).toPromise() // opens a 1s window
		time.advance(999) // still inside it
		const result = await client.query(MeDocument, {}, meContext).toPromise()

		// One attempt only — the second call never reaches the network at all.
		expect(names(stub)).toEqual(['Refresh'])
		// The blocked operation still fails as a network error, surfaced exactly like a real transport
		// failure — this is the `throw new Error(REFRESH_SUSPENDED)` branch in `refreshAuth`, verbatim.
		expect(result.error?.networkError?.message).toBe('Refresh suspended after repeated transport failures')
	})

	it('calls refresh again once the cooldown window has elapsed', async () => {
		const time = clock()
		const { client, stub } = clientWith({ Me: ME, Refresh: failingRefresh }, time.now)

		await client.query(MeDocument, {}, meContext).toPromise()
		time.advance(1_000) // exactly the first window's length: elapsed, not inside it
		await client.query(MeDocument, {}, meContext).toPromise()

		expect(names(stub)).toEqual(['Refresh', 'Refresh'])
	})

	/*
	 * A refusal the backend actually sent is not what the breaker exists for, and must not feed it. The
	 * refresh reply here is the "mutation reports failure" shape from the terminal-failure tests above —
	 * deliberately not a status carried in `SESSION_GONE`, so the only `onSessionLost` call this produces is
	 * `refreshAuth`'s own, and the assertion on it stays a meaningful count rather than one confounded by
	 * `mapExchange` also reacting to the refresh operation's own response.
	 */
	it('does not count a response-carrying refresh failure toward the breaker', async () => {
		const time = clock()
		const { client, onSessionLost, stub } = clientWith(
			{ Me: ME, Refresh: [{ data: { refresh: { status: false, accessToken: '' } } }, failingRefresh] },
			time.now
		)

		await client.query(MeDocument, {}, meContext).toPromise() // terminal — must not touch the breaker
		expect(onSessionLost).toHaveBeenCalledTimes(1)

		await client.query(MeDocument, {}, meContext).toPromise() // the breaker's first transport failure
		time.advance(999)
		await client.query(MeDocument, {}, meContext).toPromise() // still inside that 1s window
		expect(names(stub).filter((name) => name === 'Refresh')).toHaveLength(2)

		time.advance(1) // a 2s window (had the terminal failure wrongly counted) would still be open here
		await client.query(MeDocument, {}, meContext).toPromise()
		expect(names(stub).filter((name) => name === 'Refresh')).toHaveLength(3)
	})

	it('resets the breaker on a successful refresh, so the next failure opens a 1s window again', async () => {
		const time = clock()
		const { client, stub } = clientWith(
			{ Me: ME, Refresh: [failingRefresh, refreshed(), failingRefresh, failingRefresh] },
			time.now
		)

		await client.query(MeDocument, {}, meContext).toPromise() // 1st failure: opens a 1s window
		time.advance(1_000) // elapsed
		await client.query(MeDocument, {}, meContext).toPromise() // succeeds: resets the breaker
		clearAccessToken() // force the next operation through refreshAuth again
		await client.query(MeDocument, {}, meContext).toPromise() // fails — the "first" failure again

		// A 2s window (the count left un-reset) would still be open here; a fresh 1s one is not.
		time.advance(1_000)
		await client.query(MeDocument, {}, meContext).toPromise()

		expect(names(stub).filter((name) => name === 'Refresh')).toHaveLength(4)
	})

	it("resets the breaker on the browser's online event, so the next failure opens a 1s window again", async () => {
		const time = clock()
		const { client, stub } = clientWith({ Me: ME, Refresh: [failingRefresh, failingRefresh, failingRefresh] }, time.now)

		await client.query(MeDocument, {}, meContext).toPromise() // 1st failure: opens a 1s window
		window.dispatchEvent(new Event('online')) // resets the breaker mid-outage
		await client.query(MeDocument, {}, meContext).toPromise() // the "first" failure again, post-reset

		// A 2s window (the count left un-reset) would still be open here; a fresh 1s one is not.
		time.advance(1_000)
		await client.query(MeDocument, {}, meContext).toPromise()

		expect(names(stub).filter((name) => name === 'Refresh')).toHaveLength(3)
	})

	/*
	 * The wiring for `CreateGraphQLClientOptions['signal']`: a test builds one client per test and must be
	 * able to stop its breaker's `online` listener from reaching into a later test, without that also
	 * breaking the "still resets on `online`" behaviour above for a caller that passes nothing — production
	 * never aborts, and must keep resetting for as long as the page lives.
	 *
	 * The already-aborted-before-construction half of this contract is `refreshBreaker.test.ts`'s to
	 * prove, not this file's: `createGraphQLClient` only forwards `signal` to `createRefreshBreaker`,
	 * which is the one place that ever touches `window.addEventListener`.
	 */
	it("stops the browser's online event from resetting the breaker once the client's signal is aborted", async () => {
		const time = clock()
		const controller = new AbortController()
		const { client, stub } = clientWith(
			{ Me: ME, Refresh: [failingRefresh, failingRefresh, failingRefresh] },
			time.now,
			controller.signal
		)

		await client.query(MeDocument, {}, meContext).toPromise() // 1st failure: opens a 1s window
		controller.abort()
		window.dispatchEvent(new Event('online')) // no longer wired to this breaker

		// Still inside the 1s window the first failure opened — unlike the reset case above, the second
		// call never reaches the network at all.
		const result = await client.query(MeDocument, {}, meContext).toPromise()

		expect(result.error?.networkError?.message).toBe('Refresh suspended after repeated transport failures')
		expect(names(stub)).toEqual(['Refresh'])
	})
})

describe('the other way a session ends', () => {
	/*
	 * The three terminal statuses arrive on ordinary domain operations rather than on the refresh, and
	 * `authExchange` knows nothing about them — it only handles 498, because 498 is the only one a refresh
	 * can fix. Without this exchange the customer would sit on a red alert, still nominally signed in,
	 * with every subsequent action failing identically.
	 */
	it.each([
		['401 — no session', HTTP.unauthorized],
		['412 — account disabled or deleted', HTTP.preconditionFailed],
		['499 — token required', HTTP.tokenRequired]
	])('clears the session on %s', async (_label, status) => {
		const { client, onSessionLost } = clientWith({ Me: { errors: [graphQLError('Boom', undefined, status)], status } })
		setAccessToken('abc123')

		await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(getAccessToken()).toBeNull()
		expect(onSessionLost).toHaveBeenCalledTimes(1)
	})

	it.each([HTTP.badRequest, HTTP.forbidden, HTTP.internal])('leaves the session alone on a %i', async (status) => {
		const { client, onSessionLost } = clientWith({ Me: { errors: [graphQLError('Boom', undefined, status)], status } })
		setAccessToken('abc123')

		await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(getAccessToken()).toBe('abc123')
		expect(onSessionLost).not.toHaveBeenCalled()
	})

	/*
	 * ⚠️ A 498 must pass straight through this exchange. Whether to retry it is `authExchange`'s decision,
	 * and ending the session here would sign a customer out on every expired access token — the single
	 * most common authenticated case there is.
	 */
	it('leaves a 498 to the auth exchange', async () => {
		const { client, onSessionLost, stub } = clientWith({
			Me: [{ errors: [graphQLError('Invalid Token', undefined, HTTP.invalidToken)], status: 498 }, ME],
			Refresh: refreshed()
		})
		setAccessToken('expired')

		await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(onSessionLost).not.toHaveBeenCalled()
		expect(names(stub)).toEqual(['Me', 'Refresh', 'Me'])
	})

	/*
	 * A transport failure is not a lost session — the visitor's wifi dropped. Signing them out would
	 * discard a valid session over one failed request, and the reconnect would land them on a login page
	 * with no explanation of why.
	 */
	it('leaves the session alone when the request never reached the server', async () => {
		const { client, onSessionLost } = clientWith({ Me: { networkError: 'Failed to fetch' } })
		setAccessToken('abc123')

		await client.query(MeDocument, {}, CTX_USER_RESOURCE).toPromise()

		expect(getAccessToken()).toBe('abc123')
		expect(onSessionLost).not.toHaveBeenCalled()
	})
})

describe('createGraphQLClient', () => {
	// One per page load, created in src/router.tsx. Two calls must not share a cache, or a signed-out
	// visitor would read the previous session's cached account data.
	it('builds a client with a cache of its own each time', async () => {
		const first: Client = createGraphQLClient({ onSessionLost: vi.fn(), signal: trackedSignal() })
		const second: Client = createGraphQLClient({ onSessionLost: vi.fn(), signal: trackedSignal() })
		const stub = stubGraphQL({ Shops: { data: { shops: [] } } })

		await first.query(ShopsDocument, {}, CTX_PUBLIC_RESOURCE).toPromise()
		await second.query(ShopsDocument, {}, CTX_PUBLIC_RESOURCE).toPromise()

		expect(first).not.toBe(second)
		expect(stub.calls).toHaveLength(2)
	})
})
