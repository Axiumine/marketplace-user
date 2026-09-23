import { describe, expect, it, vi } from 'vitest'

import { createRefreshBreaker } from '@/api/refreshBreaker'

/** A clock a test can move by hand, so a window's edges are asserted on exact milliseconds. */
const clock = (start = 0) => {
	let current = start
	return { now: () => current, advance: (ms: number) => (current += ms) }
}

describe('createRefreshBreaker', () => {
	it('starts closed', () => {
		const breaker = createRefreshBreaker({ now: clock().now })
		expect(breaker.isOpen()).toBe(false)
	})

	it('opens a 1s window after the first consecutive failure', () => {
		const time = clock()
		const breaker = createRefreshBreaker({ now: time.now })

		breaker.recordFailure()
		expect(breaker.isOpen()).toBe(true)

		time.advance(999)
		expect(breaker.isOpen()).toBe(true)

		time.advance(1)
		expect(breaker.isOpen()).toBe(false)
	})

	// 1s, 2s, 4s: doubling on the number of failures in a row, not on time elapsed.
	it('doubles the window on the second and third consecutive failures', () => {
		const time = clock()
		const breaker = createRefreshBreaker({ now: time.now })

		breaker.recordFailure()
		time.advance(1_000)
		expect(breaker.isOpen()).toBe(false)

		breaker.recordFailure()
		time.advance(1_999)
		expect(breaker.isOpen()).toBe(true)
		time.advance(1)
		expect(breaker.isOpen()).toBe(false)

		breaker.recordFailure()
		time.advance(3_999)
		expect(breaker.isOpen()).toBe(true)
		time.advance(1)
		expect(breaker.isOpen()).toBe(false)
	})

	// The sixth consecutive failure's raw doubling would be 32s (1, 2, 4, 8, 16, 32) — capped at 30s
	// instead. Fired back to back: the counter is on consecutive calls, not on time between them.
	it('caps the window at 30s past the sixth consecutive failure', () => {
		const time = clock()
		const breaker = createRefreshBreaker({ now: time.now })

		for (let i = 0; i < 6; i++) breaker.recordFailure()

		expect(breaker.isOpen()).toBe(true)
		time.advance(29_999)
		expect(breaker.isOpen()).toBe(true)
		time.advance(1)
		expect(breaker.isOpen()).toBe(false)
	})

	// A seventh failure in a row must not push the window past the cap either.
	it('stays at the 30s cap on a seventh consecutive failure', () => {
		const time = clock()
		const breaker = createRefreshBreaker({ now: time.now })

		for (let failure = 0; failure < 7; failure++) breaker.recordFailure()

		time.advance(30_000)
		expect(breaker.isOpen()).toBe(false)
	})

	it('resets the counter and the window on success', () => {
		const time = clock()
		const breaker = createRefreshBreaker({ now: time.now })

		breaker.recordFailure()
		breaker.recordFailure() // would open a 2s window next, absent the reset below
		breaker.recordSuccess()

		expect(breaker.isOpen()).toBe(false)

		// Back to a 1s window, proving the failure count itself was zeroed and not just the window.
		breaker.recordFailure()
		time.advance(1_000)
		expect(breaker.isOpen()).toBe(false)
	})

	it('resets the counter and the window on the browser online event', () => {
		const time = clock()
		const breaker = createRefreshBreaker({ now: time.now })

		breaker.recordFailure()
		breaker.recordFailure()
		window.dispatchEvent(new Event('online'))

		expect(breaker.isOpen()).toBe(false)

		breaker.recordFailure()
		time.advance(1_000)
		expect(breaker.isOpen()).toBe(false)
	})

	// The SSR/non-browser guard: constructing a breaker where `window` does not exist must not throw, and
	// the breaker it returns must still work — refreshAuth never actually runs there (see the module doc),
	// but the guard has to hold up on its own regardless.
	it('does not touch window when it is not defined', () => {
		vi.stubGlobal('window', undefined)

		const time = clock()
		let breaker: ReturnType<typeof createRefreshBreaker> | undefined
		expect(() => {
			breaker = createRefreshBreaker({ now: time.now })
		}).not.toThrow()

		breaker?.recordFailure()
		expect(breaker?.isOpen()).toBe(true)
	})

	it('defaults to the real clock when none is injected', () => {
		const breaker = createRefreshBreaker()

		expect(breaker.isOpen()).toBe(false)
		breaker.recordFailure()
		expect(breaker.isOpen()).toBe(true)
	})
})
