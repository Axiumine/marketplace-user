import type { TypedDocumentNode } from '@urql/core'
import { gql } from '@urql/core'
import { describe, expect, it } from 'vitest'

import { runQuery } from '@/api/run'
import { createSsrClient, ssrEndpoint } from '@/api/ssr'

import { stubGraphQL } from '../helpers/graphql'

const DEFAULT_URL = 'http://127.0.0.1:4027/public-resource'

interface Shops {
	readonly shops: readonly { readonly slug: string }[]
}

const ShopsDocument = gql`
	query Shops {
		shops {
			slug
		}
	}
` as TypedDocumentNode<Shops, Record<string, never>>

describe('ssrEndpoint', () => {
	/*
	 * ⚠️ Read from `process.env`, never `import.meta.env`. A `VITE_`-prefixed variable is inlined into the
	 * client bundle at build time, and this one names a loopback address — publishing the internal
	 * topology of the stack to every visitor who opens the page source.
	 */
	it('takes the value the process was given', () => {
		expect(ssrEndpoint({ PUBLIC_RESOURCE_URL: 'http://10.0.0.5:4027/public-resource' })).toBe(
			'http://10.0.0.5:4027/public-resource'
		)
	})

	/*
	 * The default has to agree with `PORT` in `marketplace-dev-public-resource/env` and with the `ENDPOINT`
	 * constant that service exports from its `src/index.mts`. Nothing checks that agreement at build time,
	 * so a wrong default is a server that renders every public page into an error boundary.
	 */
	it('defaults to the public-resource service on the loopback interface', () => {
		expect(ssrEndpoint({})).toBe(DEFAULT_URL)
	})

	// dotenv writes `KEY=` for a variable someone meant to leave unset, so the empty string has to mean
	// absent — reading it as a value gives urql an empty URL and every SSR request fails.
	it('treats an empty value as unset', () => {
		expect(ssrEndpoint({ PUBLIC_RESOURCE_URL: '' })).toBe(DEFAULT_URL)
	})

	// The default argument, so a caller with nothing to say reads the real process environment.
	it('reads the real process environment when given no source', () => {
		expect(ssrEndpoint()).toBe(DEFAULT_URL)
	})

	/*
	 * ⚠️ The browser and the server do not use the same value. The browser sends a same-origin path that
	 * nginx proxies; the server skips nginx entirely and talks to the service directly, which is one hop
	 * less and keeps working when the public hostname does not resolve from inside the network.
	 */
	it('is an absolute URL, not the same-origin path the browser uses', () => {
		expect(ssrEndpoint({}).startsWith('http://')).toBe(true)
		expect(ssrEndpoint({})).not.toBe('/public-resource')
	})
})

describe('createSsrClient', () => {
	it('sends to the endpoint it was given', async () => {
		const stub = stubGraphQL({ Shops: { data: { shops: [] } } })
		await runQuery(createSsrClient('http://10.0.0.5:4027/public-resource'), ShopsDocument, {})

		expect(stub.calls[0]?.url).toBe('http://10.0.0.5:4027/public-resource')
	})

	it('falls back to the configured endpoint when given no URL', async () => {
		const stub = stubGraphQL({ Shops: { data: { shops: [] } } })
		await runQuery(createSsrClient(), ShopsDocument, {})

		expect(stub.calls[0]?.url).toBe(DEFAULT_URL)
	})

	/*
	 * POST for queries, for the same reason as the browser client: every service sets
	 * `csrfPrevention: true` and rejects a GET carrying none of Apollo's preflight-forcing headers, which
	 * urql does not send. Left at the default, every query short enough to fit in a URL comes back as a
	 * CSRF message while mutations work — which reads as a schema problem.
	 */
	it('posts rather than putting the query in a URL', async () => {
		const stub = stubGraphQL({ Shops: { data: { shops: [] } } })
		await runQuery(createSsrClient(DEFAULT_URL), ShopsDocument, {})

		expect(stub.calls[0]?.method).toBe('POST')
	})

	/*
	 * ⚠️ No cookies. There is no browser here and nothing to include: the fetch is process-to-process on
	 * the loopback interface, and `credentials: 'include'` on a server client would carry one visitor's
	 * cookies into a request rendered for another.
	 */
	it('sends no credentials and no authorization header', async () => {
		const stub = stubGraphQL({ Shops: { data: { shops: [] } } })
		await runQuery(createSsrClient(DEFAULT_URL), ShopsDocument, {})

		expect(stub.calls[0]?.credentials).toBeUndefined()
		expect(stub.calls[0]?.authorization).toBeNull()
	})

	/*
	 * ⚠️ A fresh client per request, and this is the assertion that it has no cache. Two clients asking
	 * the same question must both reach the server: a shared document cache on a server process is how
	 * one visitor's shop page ends up in another visitor's response, which is the entire class of SSR
	 * data-leak bug.
	 */
	it('caches nothing between two clients', async () => {
		const stub = stubGraphQL({
			Shops: [{ data: { shops: [{ slug: 'first' }] } }, { data: { shops: [{ slug: 'second' }] } }]
		})

		expect(await runQuery(createSsrClient(DEFAULT_URL), ShopsDocument, {})).toEqual({ shops: [{ slug: 'first' }] })
		expect(await runQuery(createSsrClient(DEFAULT_URL), ShopsDocument, {})).toEqual({ shops: [{ slug: 'second' }] })
		expect(stub.calls).toHaveLength(2)
	})

	/*
	 * And nothing within one client either. A cache that outlives a single request is the bug above; a
	 * cache inside one request has nothing to serve the results to, since every loader runs once.
	 */
	it('caches nothing within one client', async () => {
		const client = createSsrClient(DEFAULT_URL)
		const stub = stubGraphQL({
			Shops: [{ data: { shops: [{ slug: 'first' }] } }, { data: { shops: [{ slug: 'second' }] } }]
		})

		await runQuery(client, ShopsDocument, {})

		expect(await runQuery(client, ShopsDocument, {})).toEqual({ shops: [{ slug: 'second' }] })
		expect(stub.calls).toHaveLength(2)
	})

	/*
	 * ⚠️ No auth exchange. This client only ever talks to public-resource, which has no auth middleware at
	 * all — that absence is precisely what lets the public pages be rendered for a crawler without the
	 * server ever handling a visitor's token. A 498 here must surface as an error, never trigger a refresh
	 * that would write into the module-scoped token store a server process shares between requests.
	 */
	it('does not try to refresh a 498, it just fails', async () => {
		const stub = stubGraphQL({
			Shops: { errors: [{ message: 'Invalid Token', extensions: { http: { status: 498 } } }], status: 498 }
		})

		await expect(runQuery(createSsrClient(DEFAULT_URL), ShopsDocument, {})).rejects.toThrow('Invalid Token')
		expect(stub.calls.map((call) => call.operationName)).toEqual(['Shops'])
	})
})
