import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLogout } from '@/auth/useLogout'

import { stubLocationAssign } from '../helpers/location'

/*
 * ⚠️ **A separate file from useLogout.test.tsx on purpose.** The tests there drive the hook through a real
 * router and a real urql client, which is the right way to check what it *does*; this one checks what it
 * *closes over*, and that needs the client to be swappable — which means mocking the module, and `vi.mock`
 * is hoisted to the top of whatever file it appears in.
 *
 * What it protects: `useCallback`'s dependency list. An empty one compiles, type-checks, passes every
 * behavioural test above and is wrong — the returned function would keep the client it was first given for
 * the lifetime of the component. The client is recreated whenever the app rebuilds it (a session change
 * does exactly that), so a stale one would send the logout with the previous session's `Authorization`
 * header, and the server would delete keys the customer no longer has.
 *
 * The exit is not in the list and cannot be: `window.location.assign` is read off the global at call time,
 * so there is nothing to close over.
 */
const mocks = vi.hoisted(() => ({
	useClient: vi.fn(),
	clearAccessToken: vi.fn(),
	clearSession: vi.fn()
}))

vi.mock('urql', () => ({ useClient: mocks.useClient }))
vi.mock('@/api/tokenStore', () => ({ clearAccessToken: mocks.clearAccessToken }))
vi.mock('@/auth/session', () => ({ clearSession: mocks.clearSession }))

/** A client whose `mutation` records nothing but its own identity, so the closure can be traced back. */
const fakeClient = (id: string) => ({ id, mutation: vi.fn(() => ({ toPromise: async () => ({}) })) })

describe('useLogout dependencies', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// The hook ends in a real `location.assign`; jsdom answers the real one with a *"Not implemented:
		// navigation"* console error, which would bury whatever these tests are actually saying.
		stubLocationAssign()
	})

	it('rebuilds the callback when the urql client is replaced', () => {
		mocks.useClient.mockReturnValue(fakeClient('first'))

		const { result, rerender } = renderHook(() => useLogout())
		const first = result.current

		mocks.useClient.mockReturnValue(fakeClient('second'))
		rerender()

		expect(result.current).not.toBe(first)
	})

	// Identity is the symptom; this is the consequence. A callback that kept the first client would send
	// the logout through a client the app has already discarded.
	it('sends the mutation through the client it currently has, not the one it started with', async () => {
		const first = fakeClient('first')
		mocks.useClient.mockReturnValue(first)

		const { result, rerender } = renderHook(() => useLogout())

		const second = fakeClient('second')
		mocks.useClient.mockReturnValue(second)
		rerender()

		await result.current()

		expect(second.mutation).toHaveBeenCalledTimes(1)
		expect(first.mutation).not.toHaveBeenCalled()
	})

	// The callback is memoised, not rebuilt on every render — that is the whole reason the list exists,
	// and a component passing it to a memoised child would re-render that child on every keystroke.
	it('keeps the same callback while the client does not change', () => {
		mocks.useClient.mockReturnValue(fakeClient('only'))

		const { result, rerender } = renderHook(() => useLogout())
		const first = result.current

		rerender()

		expect(result.current).toBe(first)
	})
})
