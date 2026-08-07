import { CombinedError } from '@urql/core'
import { GraphQLError } from 'graphql'
import { describe, expect, it } from 'vitest'

import { dataOf, descriptionOf, HTTP, isAuthExpired, isSessionGone, messageOf, statusOf, visitorMessageOf } from '@/api/errors'

const GENERIC = 'Error while communicating with the server'

/** The exact shape `throwGraphQLError(status, title, description)` puts on the wire. */
const platformError = (title: string, status: number, description?: string) =>
	new GraphQLError(title, {
		extensions: { http: { status }, ...(description === undefined ? {} : { description }) }
	})

const combined = (over: { graphQLErrors?: readonly GraphQLError[]; response?: unknown; networkError?: Error }) =>
	new CombinedError({
		graphQLErrors: [...(over.graphQLErrors ?? [])],
		...(over.response === undefined ? {} : { response: over.response }),
		...(over.networkError === undefined ? {} : { networkError: over.networkError })
	})

describe('statusOf', () => {
	/*
	 * ⚠️ The response first, the extension second. Apollo reads `extensions.http` and turns it into the
	 * real HTTP status, and whether it also echoes the extension back in the body depends on its version
	 * and its formatter — so `error.response.status` is the value that is always there.
	 */
	it('reads the status off the response', () => {
		expect(statusOf(combined({ response: { status: HTTP.forbidden } }))).toBe(HTTP.forbidden)
	})

	// The fallback: a proxy that rewrote the status left the body intact, and the body still says what the
	// service meant. Without it a 498 rewritten to 500 would stop being retryable and the customer would
	// be signed out on a token that only needed refreshing.
	it('falls back to the http extension when there is no response', () => {
		expect(statusOf(combined({ graphQLErrors: [platformError('Invalid Token', HTTP.invalidToken)] }))).toBe(HTTP.invalidToken)
	})

	it('prefers the response over the extension when both are present', () => {
		expect(
			statusOf(combined({ response: { status: HTTP.forbidden }, graphQLErrors: [platformError('x', HTTP.badRequest)] }))
		).toBe(HTTP.forbidden)
	})

	/*
	 * `undefined` is the transport failure — DNS, offline, an aborted fetch. It has to stay distinguishable
	 * from every real status, because it is the one case where the session is fine and retrying makes
	 * sense.
	 */
	it('answers undefined for an error that never reached a server', () => {
		expect(statusOf(combined({ networkError: new Error('Failed to fetch') }))).toBeUndefined()
	})

	it('answers undefined when there is no error at all', () => {
		expect(statusOf(undefined)).toBeUndefined()
	})

	it.each([
		['a response with no status', { headers: {} }],
		['a status that is not a number', { status: '403' }],
		['a null response', null]
	])('ignores %s and looks at the extension instead', (_label, response) => {
		const error = combined({ response, graphQLErrors: [platformError('x', HTTP.unauthorized)] })

		expect(statusOf(error)).toBe(HTTP.unauthorized)
	})

	it('answers undefined when neither place carries a number', () => {
		expect(statusOf(combined({ graphQLErrors: [new GraphQLError('Boom')] }))).toBeUndefined()
	})

	it('answers undefined when the http extension is not an object', () => {
		const error = combined({ graphQLErrors: [new GraphQLError('Boom', { extensions: { http: 403 } })] })

		expect(statusOf(error)).toBeUndefined()
	})

	/*
	 * ⚠️ A **string** status, which is the one shape that tells the type test apart from no test at all.
	 * Every other rejected value — a missing key, a null, a non-object `http` — is already `undefined` by
	 * the time the `typeof` runs, so dropping the guard would answer `undefined` for those too and look
	 * correct. Here it would answer `'403'`, and the callers compare with `===` against numbers: an
	 * expired session would stop being recognised as one and the visitor would see a generic failure
	 * instead of being refreshed.
	 */
	it('answers undefined for a status the extension writes as a string', () => {
		const error = combined({ graphQLErrors: [new GraphQLError('Boom', { extensions: { http: { status: '403' } } })] })

		expect(statusOf(error)).toBeUndefined()
	})

	// The platform raises through `throwGraphQLError` and never sets `extensions.code`, so a client that
	// switched on the Apollo default would branch on a key nothing here writes.
	it('reads the status rather than an extensions.code the platform never sets', () => {
		const error = combined({
			graphQLErrors: [new GraphQLError('Boom', { extensions: { code: 'UNAUTHENTICATED' } })]
		})

		expect(statusOf(error)).toBeUndefined()
	})
})

describe('descriptionOf', () => {
	it('reads the long form the backend wrote for the visitor', () => {
		const error = combined({ graphQLErrors: [platformError('Bad Request', 400, 'Email o password non corretti')] })

		expect(descriptionOf(error)).toBe('Email o password non corretti')
	})

	// An empty description is a field the backend left blank, not a message — showing it would render an
	// empty alert box where the real reason should be.
	it.each([
		['no description at all', platformError('Bad Request', 400)],
		['an empty description', platformError('Bad Request', 400, '')],
		['a description that is not a string', new GraphQLError('x', { extensions: { description: 42 } })]
	])('answers undefined for %s', (_label, graphQLError) => {
		expect(descriptionOf(combined({ graphQLErrors: [graphQLError] }))).toBeUndefined()
	})

	it('answers undefined when there is no error', () => {
		expect(descriptionOf(undefined)).toBeUndefined()
	})

	it('answers undefined when the error carries no GraphQL errors', () => {
		expect(descriptionOf(combined({ networkError: new Error('offline') }))).toBeUndefined()
	})
})

describe('isAuthExpired', () => {
	/*
	 * ⚠️ 498 and nothing else. It is the only status a refresh can fix — the access token expired or was
	 * evicted from Redis while the refresh cookie is still valid. Widening this to 401 would make the auth
	 * exchange retry a session that is genuinely over, once per operation, forever.
	 */
	it('recognises 498 as the one retryable status', () => {
		expect(isAuthExpired(combined({ response: { status: HTTP.invalidToken } }))).toBe(true)
	})

	it.each([HTTP.badRequest, HTTP.unauthorized, HTTP.forbidden, HTTP.preconditionFailed, HTTP.tokenRequired, HTTP.internal])(
		'does not treat %i as retryable',
		(status) => {
			expect(isAuthExpired(combined({ response: { status } }))).toBe(false)
		}
	)

	it('does not treat a transport failure as retryable', () => {
		expect(isAuthExpired(combined({ networkError: new Error('offline') }))).toBe(false)
		expect(isAuthExpired(undefined)).toBe(false)
	})
})

describe('isSessionGone', () => {
	/*
	 * The three terminal statuses: 401 there is no session, 412 the account is disabled or deleted, 499 an
	 * operation that needs a token was sent without one. None of them is fixable by refreshing, so they
	 * end the session rather than retrying it.
	 */
	it.each([
		['401 — no session', HTTP.unauthorized],
		['412 — account disabled or deleted', HTTP.preconditionFailed],
		['499 — token required', HTTP.tokenRequired]
	])('ends the session on %s', (_label, status) => {
		expect(isSessionGone(combined({ response: { status } }))).toBe(true)
	})

	/*
	 * ⚠️ 498 must pass straight through. It is the auth exchange's to retry, and treating it as terminal
	 * here would sign a customer out on every expired access token — which is every page reload after the
	 * token's lifetime, i.e. the single most common authenticated case there is.
	 */
	it('leaves 498 to the auth exchange', () => {
		expect(isSessionGone(combined({ response: { status: HTTP.invalidToken } }))).toBe(false)
	})

	it.each([HTTP.badRequest, HTTP.forbidden, HTTP.internal])('does not end the session on %i', (status) => {
		expect(isSessionGone(combined({ response: { status } }))).toBe(false)
	})

	/*
	 * A transport failure is not a lost session — the visitor's wifi dropped. Signing them out would
	 * discard a valid session over one failed request, and the reconnect would land them on the login page
	 * with no explanation.
	 */
	it('does not end the session on a failure that never reached the server', () => {
		expect(isSessionGone(combined({ networkError: new Error('Failed to fetch') }))).toBe(false)
		expect(isSessionGone(undefined)).toBe(false)
	})
})

describe('messageOf', () => {
	// Preference order: the backend's own long description, then the title, then a generic line.
	it('prefers the description the backend wrote', () => {
		const error = combined({ graphQLErrors: [platformError('Bad Request', 400, 'La password è troppo corta')] })

		expect(messageOf(error)).toBe('La password è troppo corta')
	})

	it('falls back to the GraphQL error message when there is no description', () => {
		expect(messageOf(combined({ graphQLErrors: [platformError('Bad Request', 400)] }))).toBe('Bad Request')
	})

	/*
	 * A `CombinedError` with no GraphQL errors is a transport failure, and saying "server unreachable" for
	 * a 401 would be a lie — which is why the split is on whether any GraphQL error came back rather than
	 * on the status.
	 */
	it('falls back to a generic line for a transport failure', () => {
		expect(messageOf(combined({ networkError: new Error('Failed to fetch') }))).toBe(GENERIC)
	})

	it('falls back to a generic line for a GraphQL error with an empty message', () => {
		expect(messageOf(combined({ graphQLErrors: [new GraphQLError('')] }))).toBe(GENERIC)
	})

	// An empty string, not the generic line: there is nothing to report, and a form that renders
	// `messageOf(undefined)` unconditionally must show no alert rather than an error nobody caused.
	it('answers an empty string when there is no error', () => {
		expect(messageOf(undefined)).toBe('')
	})

	it('reads the first error when several came back', () => {
		const error = combined({ graphQLErrors: [new GraphQLError('Primo'), new GraphQLError('Secondo')] })

		expect(messageOf(error)).toBe('Primo')
	})
})

describe('visitorMessageOf', () => {
	it('reads a urql error the same way `messageOf` does', () => {
		const error = combined({ graphQLErrors: [platformError('Not Found', 404, 'Questo negozio non esiste')] })

		expect(visitorMessageOf(error)).toBe('Questo negozio non esiste')
	})

	/*
	 * ⚠️ The reason this function exists. `defaultErrorComponent` is typed to receive `Error`, not
	 * `CombinedError`: a loader may throw a plain `Error` and a component may throw a string. `messageOf`
	 * would read `.graphQLErrors[0]` off it and throw a *second* time from inside the boundary meant to
	 * contain the first — which React renders as an empty document.
	 */
	it.each([
		['a plain Error', new Error('boom')],
		['a string', 'boom'],
		['null', null],
		['undefined', undefined],
		['a number', 500],
		['an object that is not an error', { message: 'boom' }],
		['an object whose graphQLErrors is not an array', { graphQLErrors: 'boom' }]
	])('answers the generic line for %s rather than throwing', (_label, thrown) => {
		expect(visitorMessageOf(thrown)).toBe(GENERIC)
	})

	/*
	 * ⚠️ A non-urql error's own message is dropped rather than shown, and that is a security property
	 * rather than a style choice: this component renders during SSR, so its output is HTML served to an
	 * anonymous visitor, and a transport failure's message carries the internal address of the resource
	 * service.
	 */
	it('never leaks the internal address a transport error carries', () => {
		const leaky = new Error('request to http://127.0.0.1:4027/public-resource failed, ECONNREFUSED')

		expect(visitorMessageOf(leaky)).toBe(GENERIC)
		expect(visitorMessageOf(leaky)).not.toContain('127.0.0.1')
	})

	it('answers the generic line for a urql error with nothing to say', () => {
		expect(visitorMessageOf(combined({ networkError: new Error('ECONNREFUSED 127.0.0.1:4027') }))).toBe(GENERIC)
	})
})

describe('dataOf', () => {
	it('hands back the payload of an answer that carried one', () => {
		expect(dataOf({ data: { loginUser: { accessToken: 'access' } } })).toEqual({ loginUser: { accessToken: 'access' } })
	})

	it('answers undefined for a result urql called an error', () => {
		expect(dataOf({ error: combined({ graphQLErrors: [platformError('Nope', 400)] }), data: undefined })).toBeUndefined()
	})

	/*
	 * ⚠️ Data *and* an error together, which is a shape GraphQL emits routinely: an error on a nullable
	 * field nulls that field and leaves the rest of the selection populated, so the envelope carries both.
	 * The error wins here. A caller that took the payload would act on a mutation that partly failed —
	 * closing the form, clearing the fields, reporting a save — while the field it actually cared about is
	 * the one that is missing.
	 *
	 * This is the half of the condition the null-payload case cannot reach: with `data` present and
	 * non-null, the second test is false and only the error test stands between the caller and the payload.
	 */
	it('answers undefined when an error arrives alongside a partial payload', () => {
		const partial = { userUpdatePwd: true }

		expect(dataOf({ error: combined({ graphQLErrors: [platformError('Nope', 400)] }), data: partial })).toBeUndefined()
	})

	/*
	 * ⚠️ The case this helper exists for. urql reports an unusable envelope — a proxy page where the service
	 * should be — as a `CombinedError`, so a caller that tests `result.error` alone catches that one. A
	 * well-formed `{"data": null}` is not an error by any reading urql gives it: no `CombinedError`, and a
	 * `data` that is null rather than absent. Every form in the app would report it as a success, close
	 * itself, and throw away what the visitor typed — for a write the server never performed.
	 */
	it('answers undefined for a well-formed envelope carrying a null payload', () => {
		expect(dataOf({ data: null })).toBeUndefined()
	})

	// A payload that is present and *falsy* is still a payload. `0`, `''` and `false` are all answers a
	// resolver can legitimately give, and treating them as no-answer is the mistake a truthiness test makes.
	it.each([
		['false', false],
		['zero', 0],
		['an empty string', '']
	])('treats %s as an answer, because it is one', (_label, data) => {
		expect(dataOf({ data })).toBe(data)
	})
})

describe('HTTP', () => {
	// The platform's vocabulary. 498 and 499 are nginx's non-standard pair, reused here as "token expired"
	// and "token required" — the backend raises them by number, so a typo is a status nothing recognises.
	it('names the statuses the backend actually raises', () => {
		expect(HTTP).toEqual({
			badRequest: 400,
			unauthorized: 401,
			forbidden: 403,
			preconditionFailed: 412,
			invalidToken: 498,
			tokenRequired: 499,
			internal: 500
		})
	})
})
