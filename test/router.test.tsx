import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { HTTP } from '@/api/errors'
import { ItemCategoriesDocument } from '@/api/operations/publicResource/queries'
import { clearSession, getSession, setSession } from '@/auth/session'
import { getRouter } from '@/router'

import { categoriesReply } from './helpers/catalogue'
import { graphQLError, stubGraphQL } from './helpers/graphql'
import { stubLocationAssign } from './helpers/location'

/**
 * `getRouter()` builds a browser client whose refresh breaker registers a `window.addEventListener('online', …)`
 * that otherwise outlives the test — every `it` below calls `getRouter()` directly, at least once and up to
 * twice, so without this the listener accumulates on the one jsdom `window` the whole suite shares.
 */
let controller: AbortController

beforeEach(() => {
	controller = new AbortController()
})

afterEach(() => {
	controller.abort()
	vi.unstubAllGlobals()
	clearSession()
})

/**
 * A file-wide regression guard for that leak: every `online` listener any `getRouter()` call above
 * registers through `window.addEventListener` must carry a signal that ends up aborted — the whole
 * suite's proof that nothing here is still relying on the caller to clean it up.
 *
 * ⚠️ This checks the signal's `aborted` flag rather than counting `window.removeEventListener` calls.
 * jsdom's `AbortSignal` integration removes a listener internally when its signal fires — it never calls
 * the target's own `removeEventListener` to do it — so patching that method the way this probes
 * `addEventListener` would see zero removals even on a correctly cleaned-up suite, exactly the shape of a
 * false leak report.
 *
 * A plain reassignment rather than `vi.spyOn`: this config sets `restoreMocks: true`, which restores every
 * `vi.spyOn` wrapper before the *next* test — so a spy installed once in `beforeAll` would only ever see
 * the first test's calls. Wrapping the method by hand and putting it back in `afterAll` keeps the same
 * list live for the whole file regardless of that per-test restoration.
 */
const onlineRegistrations: (AbortSignal | undefined)[] = []
const realAddEventListener = window.addEventListener.bind(window)

beforeAll(() => {
	window.addEventListener = (
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions
	): void => {
		if (type === 'online') onlineRegistrations.push(typeof options === 'object' ? options?.signal : undefined)
		realAddEventListener(type, listener, options)
	}
})

afterAll(() => {
	window.addEventListener = realAddEventListener

	expect(onlineRegistrations.length).toBeGreaterThan(0)
	expect(onlineRegistrations.every((signal) => signal?.aborted === true)).toBe(true)
})

describe('the router', () => {
	/*
	 * ⚠️ The GraphQL client travels in the router context rather than being imported, and `getRouter()` runs
	 * **once per request** during server rendering. A module-level `export const client = …` would be shared
	 * by every visitor the Node process is serving at that moment, and its document cache would hand one
	 * visitor's account page to the next.
	 */
	it('builds a fresh client for every router it makes', () => {
		expect(getRouter(controller.signal).options.context.gql).not.toBe(getRouter(controller.signal).options.context.gql)
	})

	/*
	 * ⚠️ `defaultPreloadStaleTime: 0` hands staleness back to urql. The router would otherwise keep its own
	 * copy of a loader's result for 30 seconds and skip the loader entirely — two caches disagreeing about
	 * the same data, with no way to invalidate one from the other.
	 */
	it('preloads on intent and keeps no cache of its own', () => {
		const { options } = getRouter(controller.signal)

		expect(options.defaultPreload).toBe('intent')
		expect(options.defaultPreloadStaleTime).toBe(0)
	})

	// A 404 has to be a real 404 for a crawler: `notFound()` thrown from a loader lands here and the server
	// answers 404 with this markup, rather than 200 with an empty page. A soft 404 is indexed, which is
	// strictly worse than the miss.
	it('has a not-found and an error component for every route', () => {
		const { options } = getRouter(controller.signal)

		expect(options.defaultNotFoundComponent).toBeDefined()
		expect(options.defaultErrorComponent).toBeDefined()
	})

	it('restores the scroll position on a back navigation', () => {
		expect(getRouter(controller.signal).options.scrollRestoration).toBe(true)
	})

	/*
	 * ⚠️ The client is chosen by `typeof document === 'undefined'` rather than by `import.meta.env.SSR`,
	 * because this module is also loaded by vitest — where the SSR flag is false but the environment is
	 * whatever the test asked for. Under jsdom that has to be the browser client: the full one, with the
	 * document cache and the refresh flow the private area depends on.
	 */
	it('builds the browser client under jsdom, cache and all', async () => {
		const stub = stubGraphQL({ ItemCategories: categoriesReply() })
		const { gql } = getRouter(controller.signal).options.context

		await gql.query(ItemCategoriesDocument, {}).toPromise()
		await gql.query(ItemCategoriesDocument, {}).toPromise()

		// The second identical query is answered from the document cache the SSR client does not carry.
		expect(stub.calls).toHaveLength(1)
	})

	/*
	 * ⚠️ The other half of that choice, and the one that matters for privacy. With no `document` the client is
	 * the server one: no document cache — a cache on the server outlives the request and hands one visitor's
	 * result to the next — and it talks straight to public-resource on the loopback interface rather than to
	 * a same-origin path, because there is no origin to be same as.
	 *
	 * Stubbing the global rather than switching the test environment: `typeof document === 'undefined'` is
	 * evaluated inside `getRouter()`, on every call, so the branch is reachable without a second vitest
	 * project.
	 */
	/*
	 * ⚠️ The browser client is built **with** `onSessionLost: clearSession`, and the wiring is the whole
	 * point of the option: `createGraphQLClient` calls it from inside a fetch, where no component and no
	 * router are in scope. Built without it, a terminal session status leaves the tab showing a signed-in
	 * header, a private area that renders its shell, and every query failing the same way for ever — and
	 * the callback itself throws inside the exchange, so the failure surfaces nowhere near its cause.
	 *
	 * 401 rather than 498: 498 is the one status a refresh can fix, so it goes to `authExchange` and is
	 * retried. The three terminal ones arrive on ordinary domain operations and land in the `mapExchange`.
	 *
	 * ⚠️ And it ends with a **page load**, home, not a router navigation. The client is built once per page
	 * load and its document cache is keyed by query and variables alone — `Me` takes none — so a session
	 * that ended in memory could still be read back by whoever signs in next on the same tab. The session
	 * is cleared first all the same: `assign` is asynchronous, and whatever renders before the unload has
	 * to see a signed-out app.
	 */
	it('ends the session in the browser when a query says it is gone, and reloads onto the public site', async () => {
		stubGraphQL({ ItemCategories: { errors: [graphQLError('Unauthorized')], status: HTTP.unauthorized } })
		setSession('customer@marketplace.it')
		const assign = stubLocationAssign()

		const { gql } = getRouter(controller.signal).options.context
		await gql.query(ItemCategoriesDocument, {}).toPromise()

		expect(getSession()).toEqual({ signedIn: false, email: null })
		expect(assign).toHaveBeenCalledExactlyOnceWith('/')
	})

	it('builds the server client when there is no document', async () => {
		const stub = stubGraphQL({ ItemCategories: categoriesReply() })
		vi.stubGlobal('document', undefined)

		const { gql } = getRouter(controller.signal).options.context

		await gql.query(ItemCategoriesDocument, {}).toPromise()
		await gql.query(ItemCategoriesDocument, {}).toPromise()

		expect(stub.calls).toHaveLength(2)
		expect(stub.calls[0]?.url).toBe('http://127.0.0.1:4027/public-resource')
	})
})
