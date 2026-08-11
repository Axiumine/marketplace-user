/**
 * What a shared cache is allowed to do with a page of this app, decided in one place.
 *
 * ⚠️ **It lives here rather than in `src/server.ts` because of the gates.** That file is excluded from
 * coverage and from mutation (`vitest.config.ts`, `stryker.config.mjs`) on the argument that a framework
 * entry point has no unit worth testing — true of `createStartHandler`, and false of a rule that decides
 * whether one visitor's page may be handed to the next. The entry stays a wrapper; the decision is a
 * pure function of a request and a response, and is gated like everything else.
 */

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
 * the framework — see the parent workspace's `marketplace-nginx/`.
 */
export const ANONYMOUS_CACHE = 'public, s-maxage=60, stale-while-revalidate=600'

/**
 * Nothing about a signed-in visitor, and nothing about a password reset, is cacheable anywhere.
 *
 * ⚠️ `private` alone would not be enough. This app renders the account area client-side (`ssr: false`),
 * so the HTML for a signed-in visitor is in principle identical to an anonymous one — but "in principle"
 * is not a security property, and a single future route that server-renders one customer's name would
 * turn a shared cache into a machine that hands it to the next visitor. Failing closed on the presence
 * of the cookie costs a cache miss for people who are logged in, which is a rounding error on a public
 * catalogue, and it is the layer that holds even if a route is added carelessly later.
 */
export const PRIVATE_CACHE = 'private, no-store'

/**
 * The reset flow, both halves of it.
 *
 * ⚠️ **Measured, on the production build, before the fragment landed** (E12-S26): a request to
 * `/reset-password/<address>/<hash>` came back `200` carrying `cache-control: public, s-maxage=60,
 * stale-while-revalidate=600` and a body with the address and the live hash inside the router's
 * dehydration script. That is this origin inviting every shared cache in the path to keep a copy of a
 * one-time credential for ten minutes. nginx now bypasses its own disk cache for these paths
 * (`marketplace-nginx/conf.d/30-cache.conf`); this header is the same statement made to Cloudflare and
 * to anything else between here and the visitor, which that configuration cannot reach.
 *
 * Kept as a prefix rather than as the one confirm path: the `/reset-password` screen posts an address,
 * `/reset-password/confirm` is where the credential is used, and both are one-shot pages nobody gains
 * anything by caching. It is also the same prefix `robots.txt` disallows and the edge's two maps match,
 * so a fifth reset URL added later is covered by all four without a fifth edit.
 */
const RESET_PREFIX = '/reset-password'

const hasSessionCookie = (request: Request): boolean => {
	const header = request.headers.get('cookie')
	if (header === null) return false

	// Matched on the cookie *name* at a boundary, not with `includes`. A bare substring test would also
	// match a cookie called `not_refresh_token`, and — more to the point — any cookie whose *value*
	// happened to contain the string.
	return header.split(';').some((cookie) => cookie.trimStart().startsWith(`${SESSION_COOKIE}=`))
}

/**
 * Segment-aware, for the same reason the cookie test is: `startsWith(RESET_PREFIX)` alone would also be
 * true of a future `/reset-password-help` page, and quietly make it uncacheable. The prefix matches
 * itself and anything below it, and nothing else.
 */
const isResetPath = (request: Request): boolean => {
	const { pathname } = new URL(request.url)

	return pathname === RESET_PREFIX || pathname.startsWith(`${RESET_PREFIX}/`)
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

/**
 * The `Cache-Control` this response should carry, or `undefined` to leave the framework's own alone.
 *
 * ⚠️ The two `no-store` cases are tested **before** `isCacheableHtml`, so a signed-in visitor's redirect
 * and a reset page that answered 500 are marked uncacheable too. The order is the fail-closed direction:
 * the status of a response is a weaker signal than who asked for it.
 */
export const cacheControlFor = (request: Request, response: Response): string | undefined => {
	if (hasSessionCookie(request) || isResetPath(request)) return PRIVATE_CACHE
	if (isCacheableHtml(response)) return ANONYMOUS_CACHE

	return undefined
}
