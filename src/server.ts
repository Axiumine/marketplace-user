import type { Register } from '@tanstack/react-router'
import type { RequestHandler } from '@tanstack/react-start/server'
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'

/**
 * The SSR entry, and the one place the HTML cache policy is decided.
 *
 * TanStack Start would supply this file itself; it is written out to wrap the handler in the
 * `Cache-Control` logic below. Everything else is the default: `createStartHandler` +
 * `defaultStreamHandler`, streaming the shell as soon as it exists rather than waiting for every loader.
 */
const handler = createStartHandler(defaultStreamHandler)

/**
 * The refresh-token cookie, set by `setLoginCookies` in `@axiumine/koa-utils`. It is httpOnly and signed,
 * so this process cannot read its value and does not want to — only whether it is present.
 */
const SESSION_COOKIE = 'refresh_token'

/**
 * 60 seconds fresh, 10 minutes servable while a new copy is fetched.
 *
 * `s-maxage` and not `max-age`: the number is for nginx and any CDN in front of it, not for the visitor's
 * browser. A private browser cache holding a catalogue page for a minute is a page that does not update
 * when the visitor logs in; a shared cache is exactly what should hold it, and it is the layer that can
 * be purged.
 *
 * `stale-while-revalidate` is what makes the 60 tolerable. Without it, every minute the first visitor to
 * a popular page waits for a full SSR round trip; with it they are served the old copy instantly and the
 * refresh happens behind them. That is the whole of "ISR" here, and it is done by nginx rather than by
 * the framework — see the parent workspace's `nginx/`.
 */
const ANONYMOUS_CACHE = 'public, s-maxage=60, stale-while-revalidate=600'

/**
 * Nothing about a signed-in visitor is cacheable, anywhere.
 *
 * ⚠️ `private` alone would not be enough. This app renders the account area client-side (`ssr: false`),
 * so the HTML for a signed-in visitor is in principle identical to an anonymous one — but "in principle"
 * is not a security property, and a single future route that server-renders one customer's name would
 * turn a shared cache into a machine that hands it to the next visitor. Failing closed on the presence
 * of the cookie costs a cache miss for people who are logged in, which is a rounding error on a public
 * catalogue, and it is the layer that holds even if a route is added carelessly later.
 */
const PRIVATE_CACHE = 'private, no-store'

const hasSessionCookie = (request: Request): boolean => {
	const header = request.headers.get('cookie')
	if (header === null) return false

	// Matched on the cookie *name* at a boundary, not with `includes`. A bare substring test would also
	// match a cookie called `not_refresh_token`, and — more to the point — any cookie whose *value*
	// happened to contain the string.
	return header.split(';').some((cookie) => cookie.trimStart().startsWith(`${SESSION_COOKIE}=`))
}

/**
 * Only successful HTML gets a cache policy.
 *
 * A redirect, a 404 or a 500 keeps whatever the framework set. Caching a 404 for ten minutes is how a
 * shop that was published one second after a crawl stays invisible for the rest of the window, and
 * caching a 500 turns one bad upstream moment into ten minutes of a broken site.
 */
const isCacheableHtml = (response: Response): boolean =>
	response.status === 200 && (response.headers.get('content-type') ?? '').startsWith('text/html')

const fetch: RequestHandler<Register> = async (request, opts) => {
	const response = await handler(request, opts)

	if (hasSessionCookie(request)) {
		response.headers.set('cache-control', PRIVATE_CACHE)
		// Signed-in and anonymous responses differ, so any shared cache in front must key on that. It
		// cannot be told to key on the cookie's *value* — that would be one cache entry per visitor — so
		// nginx bypasses instead, and this header is the standards-conformant statement of the same fact
		// for anything else in the path.
		response.headers.set('vary', 'cookie')
	} else if (isCacheableHtml(response)) {
		response.headers.set('cache-control', ANONYMOUS_CACHE)
		response.headers.set('vary', 'cookie')
	}

	return response
}

export default { fetch }
