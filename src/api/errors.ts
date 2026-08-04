import type { CombinedError } from '@urql/core'

/**
 * The platform's error transport.
 *
 * The backend does NOT use `extensions.code`. Every failure is raised through koa-utils'
 * `throwGraphQLError(status, title, desc)`, which builds
 *
 *   new GraphQLError(title, { extensions: { http: { status }, description: desc } })
 *
 * Apollo Server reads `extensions.http` and turns it into the response's real HTTP status, which is
 * why the status is read off `error.response` first: that value is present whether or not Apollo also
 * echoes the `http` extension back in the body. The extension is the fallback, for the case where a
 * proxy has rewritten the status but the body survived intact.
 */
export const HTTP = {
	badRequest: 400,
	unauthorized: 401,
	forbidden: 403,
	preconditionFailed: 412,
	/** Access token expired or deleted from Redis. The one status that means "refresh and retry". */
	invalidToken: 498,
	tokenRequired: 499,
	internal: 500
} as const

/**
 * Statuses that mean the session is gone for good — no refresh can recover them.
 *
 * Typed to admit `undefined` so `isSessionGone` can hand it a status that was never found without a
 * guard of its own. A `status !== undefined &&` in front of the lookup reads as a safety check but is
 * not one: `undefined` is not in the list, so the answer is `false` either way.
 */
const SESSION_GONE: readonly (number | undefined)[] = [HTTP.unauthorized, HTTP.preconditionFailed, HTTP.tokenRequired]

/**
 * One property off a value of unknown shape.
 *
 * Deliberately unguarded: `?.` already answers `undefined` for `null` and for `undefined`, and reading a
 * missing key off a string or a number answers `undefined` too. A `typeof value === 'object'` test in
 * front of it would change nothing a caller can observe — the platform's own error payloads are the
 * only values that reach here — so the check is left out rather than written and never exercised.
 */
const prop = (value: unknown, key: string): unknown => (value as Record<string, unknown> | undefined)?.[key]

/**
 * The platform status behind a urql error, or undefined when the failure never reached the server
 * (DNS, offline, aborted request).
 */
export const statusOf = (error: CombinedError | undefined): number | undefined => {
	if (error === undefined) return undefined

	const responseStatus = prop(error.response, 'status')
	if (typeof responseStatus === 'number') return responseStatus

	const extensionHttp = prop(prop(error.graphQLErrors[0]?.extensions, 'http'), 'status')
	return typeof extensionHttp === 'number' ? extensionHttp : undefined
}

/** `extensions.description` — the long form the backend writes for the visitor, when it wrote one. */
export const descriptionOf = (error: CombinedError | undefined): string | undefined => {
	const description = prop(error?.graphQLErrors[0]?.extensions, 'description')
	return typeof description === 'string' && description !== '' ? description : undefined
}

export const isAuthExpired = (error: CombinedError | undefined): boolean => statusOf(error) === HTTP.invalidToken

export const isSessionGone = (error: CombinedError | undefined): boolean => SESSION_GONE.includes(statusOf(error))

/**
 * What to put in front of the visitor.
 *
 * Preference order: the backend's `description`, then the GraphQL error's own message (the `title`
 * argument of `throwGraphQLError`), then a generic line. A `CombinedError` with no GraphQL errors at
 * all is a transport failure, and saying "server unreachable" for a 401 would be a lie — hence the
 * split on whether any GraphQL error came back.
 */
export const messageOf = (error: CombinedError | undefined): string => {
	if (error === undefined) return ''

	const description = descriptionOf(error)
	if (description !== undefined) return description

	const first = error.graphQLErrors[0]
	if (first !== undefined && first.message !== '') return first.message

	return GENERIC
}

const GENERIC = 'Error while communicating with the server'

/**
 * The visitor-facing message for anything thrown into a router error boundary.
 *
 * ⚠️ This one has no counterpart in `marketplace-shopowner`, because that app has no error boundary above
 * the router. `defaultErrorComponent` is typed to receive `Error`, not `CombinedError`: a loader may throw
 * a plain `Error`, and a component may throw a string. `messageOf` would read `.graphQLErrors[0]` off it
 * and throw a *second* time from inside the boundary that was meant to contain the first, which React
 * renders as an empty document.
 *
 * A non-urql error's own `message` is deliberately dropped rather than shown. This component renders
 * during SSR, so its output is HTML served to an anonymous visitor, and a transport failure's message
 * carries the internal address of the resource service (`ECONNREFUSED 127.0.0.1:4027`).
 */
export const visitorMessageOf = (error: unknown): string => {
	const combined = error as Partial<CombinedError> | undefined
	return Array.isArray(combined?.graphQLErrors) ? messageOf(error as CombinedError) : GENERIC
}
