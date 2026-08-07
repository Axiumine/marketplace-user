import { describe, expect, it } from 'vitest'

import { clearAccessToken, getAccessToken, setAccessToken } from '@/api/tokenStore'

/*
 * `vitest.setup.ts` clears the token before every test, so nothing here has to undo itself — and the
 * clearing is what keeps a token written by one test out of the next one's assertions.
 */
describe('the access token store', () => {
	it('starts empty', () => {
		expect(getAccessToken()).toBeNull()
	})

	it('gives back what was put in', () => {
		setAccessToken('abc123')

		expect(getAccessToken()).toBe('abc123')
	})

	it('replaces the token a refresh rotated', () => {
		setAccessToken('old')
		setAccessToken('new')

		expect(getAccessToken()).toBe('new')
	})

	it('clears back to null', () => {
		setAccessToken('abc123')
		clearAccessToken()

		expect(getAccessToken()).toBeNull()
	})

	// `null`, never the empty string: `getAccessToken() === null` is what `willAuthError` branches on, and
	// an empty string would be a token as far as that check is concerned — one that the backend then 498s.
	it('clears to null rather than to an empty string', () => {
		setAccessToken('abc123')
		clearAccessToken()

		expect(getAccessToken()).not.toBe('')
	})

	it('is safe to clear when there was nothing to clear', () => {
		clearAccessToken()
		clearAccessToken()

		expect(getAccessToken()).toBeNull()
	})

	/*
	 * ⚠️ In memory only — never localStorage, never sessionStorage, never a readable cookie. A token
	 * JavaScript can read from storage is a token any successful XSS can exfiltrate, and it outlives the
	 * tab that leaked it. This asserts the module wrote nowhere a script could find it.
	 */
	it('persists the token nowhere a script could read it back', () => {
		setAccessToken('super-secret-token')

		expect(window.localStorage.getItem('accessToken')).toBeNull()
		expect(window.localStorage.length).toBe(0)
		expect(window.sessionStorage.length).toBe(0)
		expect(document.cookie).not.toContain('super-secret-token')
	})

	/*
	 * A reload losing the token is the design, not a limitation: the refresh token is a signed httpOnly
	 * cookie this code cannot see, so the first authenticated operation after a reload re-mints the access
	 * token from it and nothing was ever persisted client-side.
	 */
	it('is gone after the module-scoped state is cleared, the way a reload leaves it', () => {
		setAccessToken('abc123')
		clearAccessToken()

		expect(getAccessToken()).toBeNull()
	})
})
