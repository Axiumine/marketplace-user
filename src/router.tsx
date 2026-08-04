import { createRouter } from '@tanstack/react-router'
import type { Client } from '@urql/core'

import { createGraphQLClient } from '@/api/client'
import { createSsrClient } from '@/api/ssr'
import { clearSession } from '@/auth/session'
import { NotFound } from '@/components/layout/NotFound'
import { RouteError } from '@/components/layout/RouteError'

import { routeTree } from './routeTree.gen'

/**
 * What every loader and `beforeLoad` receives.
 *
 * The GraphQL client travels in the router context rather than being imported, and that is the single
 * most important line in this file. `getRouter()` is called **once per request** on the server, so a
 * context-carried client is per-request; a module-level `export const client = …` would be shared by
 * every visitor the Node process is serving at that moment, and its document cache would hand one
 * visitor's account page to the next. Loaders must read `context.gql` and must never import a client
 * directly.
 */
export interface RouterContext {
	readonly gql: Client
}

/**
 * Two different clients, chosen by where the code is running.
 *
 * On the server: `createSsrClient`, which has no cache, no auth exchange and no cookies — it only ever
 * talks to the anonymous catalogue service. On the client: the full one, with the document cache and
 * the refresh flow.
 *
 * `typeof document === 'undefined'` is the test rather than `import.meta.env.SSR`, because this module
 * is also loaded by vitest, where the SSR flag is false but the environment is whatever the test asked
 * for. The browser branch is what a jsdom test gets, which is what a test of the private area needs.
 */
const createClient = (): Client =>
	typeof document === 'undefined' ? createSsrClient() : createGraphQLClient({ onSessionLost: clearSession })

/**
 * ⚠️ Called **per request** during server rendering. Anything constructed in here is per-request state
 * and is safe; anything constructed at module scope in an imported file is not.
 *
 * `defaultPreload: 'intent'` starts a route's loader on hover or focus. On a catalogue this is most of
 * the perceived speed — the shop page's query is usually finished before the click lands — and it costs
 * the backend nothing that a click would not have cost a moment later.
 *
 * `defaultPreloadStaleTime: 0` hands staleness back to urql. The router would otherwise keep its own
 * copy of a loader's result for 30 seconds and skip the loader entirely, which means two caches
 * disagreeing about the same data with no way to invalidate one from the other.
 */
export const getRouter = () => {
	const gql = createClient()

	return createRouter({
		routeTree,
		context: { gql },
		defaultPreload: 'intent',
		defaultPreloadStaleTime: 0,
		// A 404 has to be a real 404 for a crawler. `notFound()` thrown from a loader lands here, and the
		// server answers 404 with this markup rather than 200 with an empty page — a "soft 404" is indexed,
		// which is strictly worse than the miss.
		defaultNotFoundComponent: NotFound,
		defaultErrorComponent: RouteError,
		scrollRestoration: true
	})
}

declare module '@tanstack/react-router' {
	interface Register {
		router: ReturnType<typeof getRouter>
	}
}
