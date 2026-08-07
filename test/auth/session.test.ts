import { describe, expect, it, vi } from 'vitest'

import { clearSession, getServerSession, getSession, setSession, subscribeSession } from '@/auth/session'

import { CUSTOMER_EMAIL } from '../helpers/render'

describe('the session store', () => {
	// `vitest.setup.ts` clears it before every test, so a visitor is what every test starts as.
	it('starts signed out', () => {
		expect(getSession()).toEqual({ signedIn: false, email: null })
	})

	it('remembers the address the customer signed in with', () => {
		setSession(CUSTOMER_EMAIL)

		expect(getSession()).toEqual({ signedIn: true, email: CUSTOMER_EMAIL })
	})

	/*
	 * Signed in with no address is a real state, not a broken one: the auth exchange re-mints a token from
	 * the refresh cookie after a reload, and nothing in that path knows the address — `me` answers it
	 * later.
	 */
	it('is signed in even when the address is unknown', () => {
		setSession(null)

		expect(getSession()).toEqual({ signedIn: true, email: null })
	})

	it('goes back to signed out', () => {
		setSession(CUSTOMER_EMAIL)
		clearSession()

		expect(getSession()).toEqual({ signedIn: false, email: null })
	})

	it('drops the address when the session ends', () => {
		setSession(CUSTOMER_EMAIL)
		clearSession()

		expect(getSession().email).toBeNull()
	})

	/*
	 * ⚠️ `useSyncExternalStore` compares snapshots by identity and re-renders on a change, so a store that
	 * built a fresh object per read would re-render forever. The value is replaced, never mutated, and
	 * both states are frozen so nothing downstream can mutate one by accident.
	 */
	it('answers the identical object until something changes', () => {
		expect(getSession()).toBe(getSession())

		setSession(CUSTOMER_EMAIL)

		expect(getSession()).toBe(getSession())
	})

	it('is frozen, so no reader can mutate the state every other reader holds', () => {
		setSession(CUSTOMER_EMAIL)

		expect(Object.isFrozen(getSession())).toBe(true)
	})

	it('answers a new object once the state changed', () => {
		const before = getSession()
		setSession(CUSTOMER_EMAIL)

		expect(getSession()).not.toBe(before)
	})
})

describe('subscribeSession', () => {
	it('tells a listener that the customer signed in', () => {
		const listener = vi.fn()
		subscribeSession(listener)

		setSession(CUSTOMER_EMAIL)

		expect(listener).toHaveBeenCalledTimes(1)
	})

	it('tells a listener that the session ended', () => {
		const listener = vi.fn()
		subscribeSession(listener)

		clearSession()

		expect(listener).toHaveBeenCalledTimes(1)
	})

	it('tells every listener, since more than one component reads the store', () => {
		const first = vi.fn()
		const second = vi.fn()
		subscribeSession(first)
		subscribeSession(second)

		setSession(CUSTOMER_EMAIL)

		expect(first).toHaveBeenCalledTimes(1)
		expect(second).toHaveBeenCalledTimes(1)
	})

	/*
	 * The unsubscribe React calls on unmount. A listener that outlived its component would call `setState`
	 * on an unmounted tree on the next login — and, worse, would keep the component's whole closure alive
	 * for as long as the tab is open.
	 */
	it('stops telling a listener that unsubscribed', () => {
		const listener = vi.fn()
		const unsubscribe = subscribeSession(listener)

		unsubscribe()
		setSession(CUSTOMER_EMAIL)

		expect(listener).not.toHaveBeenCalled()
	})

	it('is safe to unsubscribe twice', () => {
		const listener = vi.fn()
		const unsubscribe = subscribeSession(listener)

		unsubscribe()
		unsubscribe()
		setSession(CUSTOMER_EMAIL)

		expect(listener).not.toHaveBeenCalled()
	})

	// Registering the same function twice registers it once — the listeners live in a `Set`. Two
	// components sharing one module-level callback must not each get their own notification.
	it('registers a repeated listener only once', () => {
		const listener = vi.fn()
		subscribeSession(listener)
		subscribeSession(listener)

		setSession(CUSTOMER_EMAIL)

		expect(listener).toHaveBeenCalledTimes(1)
	})

	it('passes no arguments — a listener re-reads the snapshot itself', () => {
		const listener = vi.fn()
		subscribeSession(listener)

		setSession(CUSTOMER_EMAIL)

		expect(listener).toHaveBeenCalledWith()
	})
})

describe('getServerSession', () => {
	/*
	 * ⚠️ Always signed out, whatever the module happens to hold. Module state on a server is shared by
	 * every concurrent request, so a server render that read the live store would put one visitor's
	 * signed-in header into the next visitor's HTML — the exact leak the `ssr: false` account routes and
	 * the cookie-keyed `proxy_cache` bypass exist to prevent.
	 */
	it('reports signed out even while the store says otherwise', () => {
		setSession(CUSTOMER_EMAIL)

		expect(getServerSession()).toEqual({ signedIn: false, email: null })
	})

	/*
	 * And it must be the *same* object every time. React compares the server snapshot by identity across
	 * renders, and a fresh object each call throws "The result of getServerSnapshot should be cached".
	 */
	it('answers the identical snapshot every time', () => {
		expect(getServerSession()).toBe(getServerSession())
	})

	it('answers the same object the store starts at, so hydration matches', () => {
		expect(getServerSession()).toBe(getSession())
	})
})
