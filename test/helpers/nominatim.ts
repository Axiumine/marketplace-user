import { vi } from 'vitest'

import type { RestHandler } from './graphql'

/**
 * The prefix every geocoder request starts with. Anything else is not this stub's business.
 *
 * Root-relative, unlike the sibling apps' `https://nominatim.openstreetmap.org/search`: this app queries
 * the on-premises instance through nginx on its own origin, and `VITE_NOMINATIM_URL` is pinned empty in
 * vitest.config.ts so `env.nominatimUrl` is the `/nominatim` default on every machine.
 */
export const NOMINATIM_SEARCH = '/nominatim/search'

export interface ResponseOsm {
	/** The parsed array Nominatim answers with. Defaults to no matches. */
	results?: readonly unknown[]
	/** HTTP status. Defaults to 200 — 429 and 503 are what a rate-limited client actually gets. */
	status?: number
	/** A raw body, for the answer that is not JSON at all. Wins over `results`. */
	body?: string
	/** Never settles unless the request is aborted, pinning the field in its searching state. */
	pending?: boolean
	/**
	 * Milliseconds before the answer settles; immediate by default.
	 *
	 * What makes a slow answer land *after* a fast one that replaced it — the only way to tell a client
	 * that abandons the request it superseded from one that lets both through in whatever order.
	 */
	delay?: number
}

/**
 * One Nominatim result, with the keys the real service sends for an Italian street address.
 *
 * `lat`/`lon` are strings and `place_id` a number because that is what jsonv2 puts on the wire — the
 * coercion in `src/lib/nominatim.ts` exists for exactly this, and a fixture that pre-converted them
 * would leave it untested.
 */
export const resultOsm = (over: Record<string, unknown> = {}) => ({
	place_id: 240109189,
	display_name: 'Via Roma, 1, Milano, MI, 20121, Italia',
	lat: '45.46420',
	lon: '9.18950',
	address: {
		road: 'Via Roma',
		house_number: '1',
		postcode: '20121',
		city: 'Milano',
		county: 'Milano',
		'ISO3166-2-lvl6': 'IT-MI',
		country_code: 'it'
	},
	...over
})

/**
 * Rejects when the request is aborted, the way the real `fetch` does.
 *
 * Worth the few lines: the address field's whole ordering guarantee is that an abandoned request
 * cannot land after the one that replaced it, and a stub that ignored `signal` would answer both and
 * prove the opposite of what the test claims.
 */
const abortOf = (signal: AbortSignal | null | undefined): Promise<never> =>
	new Promise<never>((_, reject) => {
		if (signal === null || signal === undefined) return

		const onAbort = () => {
			reject(new DOMException('The operation was aborted.', 'AbortError'))
		}

		if (signal.aborted) onAbort()
		else signal.addEventListener('abort', onAbort)
	})

const responseOf = (response: ResponseOsm): Response =>
	new Response(response.body ?? JSON.stringify(response.results ?? []), {
		status: response.status ?? 200,
		headers: { 'content-type': 'application/json' }
	})

const deliver = (response: ResponseOsm): Promise<Response> =>
	response.delay === undefined
		? Promise.resolve(responseOf(response))
		: new Promise<Response>((resolve) => {
				setTimeout(() => {
					resolve(responseOf(response))
				}, response.delay)
			})

export interface OsmStub {
	/** Every geocoder URL requested, in order. */
	readonly calls: string[]
	/** Pass to `stubGraphQL(replies, rest)` in a test that also talks GraphQL. */
	readonly rest: RestHandler
}

/**
 * A queue of geocoder answers, as a handler `stubGraphQL` can be given.
 *
 * The last answer in the queue repeats, like the GraphQL helper's: a test that does not care how many
 * times the field re-queries does not have to count.
 */
export const osmStub = (replies: ResponseOsm | readonly ResponseOsm[] = {}): OsmStub => {
	const queue = Array.isArray(replies) ? [...(replies as ResponseOsm[])] : [replies as ResponseOsm]
	const calls: string[] = []

	const rest: RestHandler = (url, init) => {
		if (!url.startsWith(NOMINATIM_SEARCH)) return undefined

		calls.push(url)
		const response = queue.length > 1 ? (queue.shift() as ResponseOsm) : (queue[0] as ResponseOsm)
		const abortPromise = abortOf(init?.signal)

		return response.pending === true ? abortPromise : Promise.race([deliver(response), abortPromise])
	}

	return { calls, rest }
}

/** The same queue installed as the only `fetch` there is, for a test that sends nothing else. */
export const installOsm = (replies: ResponseOsm | readonly ResponseOsm[] = {}): OsmStub => {
	const stub = osmStub(replies)

	vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
		const response = stub.rest(String(input), init)
		if (response === undefined) throw new Error(`Unhandled request: ${String(input)}`)

		return Promise.resolve(response)
	})

	return stub
}
