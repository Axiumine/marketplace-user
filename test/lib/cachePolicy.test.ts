import { describe, expect, it } from 'vitest'

import { ANONYMOUS_CACHE, cacheControlFor, PRIVATE_CACHE } from '@/lib/cachePolicy'

const ORIGIN = 'https://marketplace-domain.com'

const get = (path: string, cookie?: string): Request =>
	new Request(`${ORIGIN}${path}`, cookie === undefined ? undefined : { headers: { cookie } })

const html = (status = 200): Response =>
	new Response('<!DOCTYPE html>', { status, headers: { 'content-type': 'text/html; charset=utf-8' } })

describe('cacheControlFor on the catalogue', () => {
	it('lets a shared cache hold an anonymous page for a minute', () => {
		expect(cacheControlFor(get('/shops'), html())).toBe(ANONYMOUS_CACHE)
	})

	/*
	 * ⚠️ A 404 and a 500 keep whatever the framework set. Caching a 404 for ten minutes is how a shop
	 * published one second after a crawl stays invisible for the rest of the window, and caching a 500
	 * turns one bad upstream moment into ten minutes of a broken site.
	 */
	it.each([404, 500])('leaves a %d alone', (status) => {
		expect(cacheControlFor(get('/shops'), html(status))).toBeUndefined()
	})

	// Everything this handler answers is HTML; anything else came from somewhere with its own opinion.
	it('leaves a non-HTML answer alone', () => {
		const json = new Response('{}', { headers: { 'content-type': 'application/json' } })

		expect(cacheControlFor(get('/shops'), json)).toBeUndefined()
	})

	// `new Response(null)` and not `new Response('')`: a string body makes the constructor set
	// `content-type: text/plain` itself, and the header this asserts the absence of would be present.
	it('leaves an answer with no content type alone', () => {
		expect(cacheControlFor(get('/shops'), new Response(null))).toBeUndefined()
	})
})

describe('cacheControlFor on a signed-in visitor', () => {
	/*
	 * ⚠️ Failing closed on the *presence* of the cookie, not on what the page turned out to contain. The
	 * account area renders client-side, so its HTML is in principle identical to an anonymous visitor's —
	 * and "in principle" is not a security property. One future route that server-renders a customer's
	 * name would otherwise turn a shared cache into a machine that hands it to the next visitor.
	 */
	it('stores nothing when the session cookie is present', () => {
		expect(cacheControlFor(get('/', 'refresh_token=abc'), html())).toBe(PRIVATE_CACHE)
	})

	// Second in the header, and behind the space a `Cookie` header puts after every `;`.
	it('finds the cookie wherever it sits in the header', () => {
		expect(cacheControlFor(get('/', 'theme=dark; refresh_token=abc'), html())).toBe(PRIVATE_CACHE)
	})

	/*
	 * ⚠️ Matched on the cookie *name* at a boundary. A bare `includes` would also match a cookie called
	 * `not_refresh_token` — and, worse, any cookie whose *value* happened to carry the string, which is
	 * one analytics blob away from turning the cache off for every visitor.
	 */
	it.each(['not_refresh_token=abc', 'analytics=refresh_token=abc'])('is not fooled by %s', (cookie) => {
		expect(cacheControlFor(get('/', cookie), html())).toBe(ANONYMOUS_CACHE)
	})

	it('treats a request with no cookie header at all as anonymous', () => {
		expect(cacheControlFor(get('/'), html())).toBe(ANONYMOUS_CACHE)
	})

	// The decision is made before the response is looked at, so a redirect or an error page for a
	// signed-in visitor is uncacheable too — who asked is a stronger signal than how it went.
	it('stores nothing whatever the status was', () => {
		expect(cacheControlFor(get('/account', 'refresh_token=abc'), html(302))).toBe(PRIVATE_CACHE)
	})
})

/*
 * ⚠️ **Measured before the fragment landed** (E12-S26): a production build answered
 * `/reset-password/<address>/<hash>` with `200`, `cache-control: public, s-maxage=60,
 * stale-while-revalidate=600`, and the address and live hash inside the router's dehydration script —
 * this origin inviting every shared cache in the path to keep a one-time credential for ten minutes.
 * nginx bypasses its own disk cache for these paths; these assertions are the same statement made to
 * Cloudflare, which that configuration cannot reach.
 */
describe('cacheControlFor on the reset flow', () => {
	it.each(['/reset-password', '/reset-password/confirm'])('stores nothing for %s', (path) => {
		expect(cacheControlFor(get(path), html())).toBe(PRIVATE_CACHE)
	})

	// Anonymous: no cookie is involved, which is the whole point — the old link shape carried its
	// credential in the path of a request no session had been established for.
	it('stores nothing for an old-shape link that is still in a mailbox', () => {
		expect(cacheControlFor(get('/reset-password/alice@example.com/9f3cabcd'), html())).toBe(PRIVATE_CACHE)
	})

	/*
	 * ⚠️ The prefix matches itself and whole segments below it, nothing else. A bare `startsWith` would
	 * make a future `/reset-password-help` page uncacheable by accident — a performance bug that no test
	 * of the reset flow would ever notice.
	 */
	it('does not swallow a neighbouring path that merely starts the same', () => {
		expect(cacheControlFor(get('/reset-password-help'), html())).toBe(ANONYMOUS_CACHE)
	})
})
