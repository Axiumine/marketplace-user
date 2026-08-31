import { vi } from 'vitest'

/**
 * The GraphQL test double, installed at the `fetch` layer rather than as a urql mock client.
 *
 * Everything above `fetch` is then the real thing: `cacheExchange`, `authExchange` — including the
 * pre-emptive refresh and the 498 retry — the status extraction in `src/api/errors.ts`, and the
 * `mapExchange` that ends a dead session. A mock client would stub all of that out and the tests would
 * assert that the mock returns what the mock was told to return.
 *
 * Replies are queued per operation name, so a test can say "the first Me fails with 498, the Refresh
 * succeeds, the retry succeeds" and get exactly that sequence.
 */
export interface GraphQLReply {
	/** The `data` field of the response body. */
	data?: unknown
	/**
	 * The `errors` field. Present means urql builds a `CombinedError`; the `status` below is what
	 * `statusOf` reads off `error.response`, which is how the platform transports its 4xx vocabulary.
	 */
	errors?: readonly unknown[]
	/** HTTP status. Defaults to 200. */
	status?: number
	/**
	 * A raw response body, for the answer that is not a well-formed GraphQL envelope. Wins over `data`
	 * and `errors`.
	 *
	 * `data` above cannot express "no `data` key at all": `JSON.stringify` writes `"data":null` for it,
	 * and urql reports that as a `data` of `null` rather than of `undefined`. The two are different
	 * failures — `null` is a resolver answering nothing, `undefined` is a body that is not a GraphQL
	 * response — and `runQuery` has a branch for the second.
	 */
	body?: string
	/** Never settles, pinning the operation at `fetching: true`. */
	pending?: boolean
	/** Rejects the request the way an offline browser does — no response, no status. */
	networkError?: string
}

export interface GraphQLCall {
	readonly operationName: string
	readonly variables: Record<string, unknown>
	readonly url: string
	readonly method: string
	readonly authorization: string | null
	readonly credentials: RequestCredentials | undefined
}

export interface GraphQLStub {
	/** Every request the code under test sent, in order. */
	readonly calls: GraphQLCall[]
}

/** A queue per operation name. A single reply is shorthand for a queue of one that repeats. */
export type GraphQLReplies = Record<string, GraphQLReply | readonly GraphQLReply[]>

/**
 * Handles a request that is not GraphQL, by URL.
 *
 * This app makes several — the Nominatim geocoder behind the address field, the Turnstile script, the
 * MapLibre style JSON and the PMTiles archive — and all of them go through the same `fetch` this helper
 * replaces, so they have to be answered here or they land in the queue lookup below and throw as an
 * unconfigured operation. Returning `undefined` means "not mine", and the request falls through to the
 * GraphQL handling.
 *
 * A test that stubs only the geocoder passes `stubGraphQL({}, rest)`: the empty reply table is not a
 * gap, it is the assertion that nothing GraphQL was sent.
 */
export type RestHandler = (url: string, init: RequestInit | undefined) => Response | Promise<Response> | undefined

const NEVER = new Promise<Response>(() => {
	/* deliberately never settles */
})

const headerOf = (init: RequestInit | undefined, name: string): string | null => {
	const headers = init?.headers
	if (headers === undefined) return null
	if (headers instanceof Headers) return headers.get(name)

	const entries = Array.isArray(headers) ? headers : Object.entries(headers as Record<string, string>)
	const found = entries.find(([key]) => key.toLowerCase() === name.toLowerCase())
	return found?.[1] ?? null
}

const jsonResponse = (reply: GraphQLReply): Response =>
	new Response(reply.body ?? JSON.stringify({ data: reply.data ?? null, errors: reply.errors }), {
		status: reply.status ?? 200,
		headers: { 'content-type': 'application/json' }
	})

/**
 * Replaces `globalThis.fetch` for the duration of the test. `unstubGlobals` in vitest.config.ts puts
 * the original back afterwards, so nothing has to be undone by hand.
 */
export const stubGraphQL = (replies: GraphQLReplies, rest?: RestHandler): GraphQLStub => {
	const queues = new Map<string, GraphQLReply[]>(
		Object.entries(replies).map(([name, reply]) => [name, Array.isArray(reply) ? [...reply] : [reply as GraphQLReply]])
	)

	const calls: GraphQLCall[] = []

	vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
		const handled = rest?.(String(input), init)
		if (handled !== undefined) return Promise.resolve(handled)

		const body = JSON.parse(String(init?.body ?? '{}')) as { operationName?: string; variables?: Record<string, unknown> }
		const operationName = body.operationName ?? '(anonymous)'

		calls.push({
			operationName,
			variables: body.variables ?? {},
			url: String(input),
			method: init?.method ?? 'GET',
			authorization: headerOf(init, 'authorization'),
			credentials: init?.credentials
		})

		const queue = queues.get(operationName)

		// A loud failure, not a default reply: an operation nobody expected is the interesting half of a
		// regression, and answering it with an empty result hides it behind a rendering assertion.
		if (queue === undefined) throw new Error(`No reply configured for operation «${operationName}»`)

		// The last reply in a queue repeats, so a test that does not care how many times a component
		// refetches does not have to count.
		const reply = queue.length > 1 ? (queue.shift() as GraphQLReply) : (queue[0] as GraphQLReply)

		if (reply.pending === true) return NEVER
		if (reply.networkError !== undefined) return Promise.reject(new Error(reply.networkError))

		return Promise.resolve(jsonResponse(reply))
	})

	return { calls }
}

/**
 * The shape `throwGraphQLError(status, title, description)` puts on the wire.
 *
 * `code` is the fourth argument because only one error on the platform carries one — the lost refresh
 * race, which `throwRefreshRaceRetry` raises directly rather than through `throwGraphQLError`.
 */
export const graphQLError = (title: string, description?: string, status = 400, code?: string) => ({
	message: title,
	extensions: {
		http: { status },
		...(description === undefined ? {} : { description }),
		...(code === undefined ? {} : { code })
	}
})
