import { describe, expect, it } from 'vitest'

import { readResetCredential } from '@/features/auth/resetLink'

/**
 * The fragment exactly as `marketplace-dev-public-resource` writes it: `RESET_PATH_USER` ends in `#`, and
 * koa-utils appends `` `/${encodeURI(email)}/${hash}` `` after it (`SocketLabsLib.mjs:280-283`). Every
 * accepting case below is this shape, because this shape is the only one the platform ever sends.
 */
const SENT = '#/alice@example.com/a1b2c3d4e5f60718293a4b5c6d7e8f90'

describe('readResetCredential on the link the platform sends', () => {
	it('reads the pair out of the fragment', () => {
		expect(readResetCredential(SENT)).toEqual({
			email: 'alice@example.com',
			hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
		})
	})

	// A one-character address is not a realistic customer, it is the shortest fragment that is still whole:
	// it puts the separator at the first position the parser could confuse with "no separator at all".
	it('reads a pair whose halves are one character each', () => {
		expect(readResetCredential('#/a/b')).toEqual({ email: 'a', hash: 'b' })
	})

	/*
	 * ⚠️ Decoding is for links something rewrote in transit, not for links as sent: `z.email()` accepts
	 * nothing outside ASCII, so `encodeURI` is the identity on every address this platform can register.
	 * A gateway that percent-encodes the `@` still has to reach the right account.
	 */
	it('decodes an address something re-encoded on the way', () => {
		expect(readResetCredential('#/alice%40example.com/9f3c')).toEqual({ email: 'alice@example.com', hash: '9f3c' })
	})

	/*
	 * ⚠️ The hash is taken verbatim while the address is decoded, and that asymmetry is the whole of it:
	 * koa-utils interpolates the hash raw. Decoding it would corrupt a legitimate one the moment it
	 * contained a `%`, and the mutation would then be refused with a message about an expired link.
	 */
	it('leaves the hash exactly as the mail wrote it', () => {
		expect(readResetCredential('#/alice@example.com/9f%3c')?.hash).toBe('9f%3c')
	})
})

/*
 * Everything below is one state for the customer — the link is not going to work — so every assertion is
 * the same `undefined`. They are separate cases because each is a different way for a link to arrive
 * broken, and a parser that accepted any of them would send a half-credential to the server and report
 * the failure as an expired hash.
 */
describe('readResetCredential on anything else', () => {
	it('refuses a page opened with no fragment at all', () => {
		expect(readResetCredential('')).toBeUndefined()
	})

	// What `window.location.hash` holds for `…/confirm#`: a `#` the mail client kept and a pair it lost.
	it('refuses a bare hash mark', () => {
		expect(readResetCredential('#')).toBeUndefined()
	})

	/*
	 * ⚠️ The path, not the fragment. This is the shape the old `/reset-password/$email/$hash` route was
	 * given, and the one thing that must never be read here: a value that reached this app through a path
	 * has already been through every log, cache key and `Referer` the fragment exists to stay out of.
	 */
	it('refuses a pair that arrived as a path', () => {
		expect(readResetCredential('/alice@example.com/9f3c')).toBeUndefined()
	})

	it('refuses a fragment that does not start at a segment boundary', () => {
		expect(readResetCredential('#alice@example.com/9f3c')).toBeUndefined()
	})

	it('refuses a fragment with no hash in it', () => {
		expect(readResetCredential('#/alice@example.com')).toBeUndefined()
	})

	it('refuses a third segment', () => {
		expect(readResetCredential('#/alice@example.com/9f3c/extra')).toBeUndefined()
	})

	it('refuses an empty address', () => {
		expect(readResetCredential('#//9f3c')).toBeUndefined()
	})

	it('refuses an empty hash', () => {
		expect(readResetCredential('#/alice@example.com/')).toBeUndefined()
	})

	/*
	 * ⚠️ `decodeURIComponent` throws a `URIError` on both of these — a lone `%` and an escape that is not
	 * valid UTF-8 — and an uncaught throw in a route component is the error boundary, not a page that says
	 * what to do next. Neither reaches this app from a mail this platform sent; both reach it from a URL
	 * somebody typed.
	 */
	it.each(['#/al%zz/9f3c', '#/al%FF/9f3c'])('refuses an address that will not decode: %s', (fragment) => {
		expect(readResetCredential(fragment)).toBeUndefined()
	})
})
