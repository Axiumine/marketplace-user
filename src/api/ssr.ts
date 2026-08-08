import { Client, fetchExchange } from '@urql/core'

/**
 * The server-side GraphQL client, built fresh for every request.
 *
 * ⚠️ **Never reuse one across requests, and never add a cache exchange to it.** A module-level client
 * on the server is shared by every visitor the process is handling at that moment; its document cache
 * would serve one visitor's result to the next, and its `fetchOptions` would carry one visitor's
 * cookies into another's request. The whole class of "user A saw user B's page" SSR bugs is this
 * object being a singleton. A new `Client` per request costs an object allocation.
 *
 * Three things are deliberately absent:
 *
 * - **No `cacheExchange`.** Caching a single request's results has nothing to serve them to, and a
 *   cache that outlives the request is the bug above. HTTP caching happens in nginx instead, where it
 *   can be keyed and bypassed properly (see nginx/conf.d/30-cache.conf in the parent workspace).
 * - **No `authExchange`.** This client only ever talks to `public-resource`, which has no auth
 *   middleware at all. That absence is the reason the public pages can be server-rendered for a crawler
 *   without the server ever handling a visitor's token.
 * - **No `credentials: 'include'`.** There is no browser here and nothing to include. The fetch goes
 *   process-to-process on the loopback interface.
 *
 * The private area never reaches this file: those routes are `ssr: false`, so authenticated HTML is
 * never produced on the server and can never end up in an HTTP cache.
 */

/**
 * Where the server sends its GraphQL, as an absolute URL.
 *
 * Read from `process.env`, **not** `import.meta.env`: a `VITE_`-prefixed variable is inlined into the
 * client bundle, and this value has no business being there. It is also not the same value the browser
 * uses — the browser sends a same-origin path that nginx proxies, while the server skips nginx and
 * talks straight to the service on the loopback interface. One less hop, and it keeps working when the
 * public hostname is not resolvable from inside the network.
 *
 * The default matches `PORT` in `marketplace-dev-public-resource/env` and the `ENDPOINT` constant that
 * service exports from its `src/index.mts`. Both have to agree with this string.
 */
export const ssrEndpoint = (source: NodeJS.ProcessEnv = process.env): string => {
	const configured = source.PUBLIC_RESOURCE_URL
	return configured === undefined || configured === '' ? 'http://127.0.0.1:4027/public-resource' : configured
}

/** A single-use client for one server-rendered request. */
export const createSsrClient = (url: string = ssrEndpoint()): Client =>
	new Client({
		url,
		// POST for queries, for the same reason as the browser client: every service sets
		// `csrfPrevention: true` and rejects a GET that carries none of Apollo's preflight headers.
		preferGetMethod: false,
		exchanges: [fetchExchange]
	})
