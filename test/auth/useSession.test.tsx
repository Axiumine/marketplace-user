import { act, render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { clearSession, setSession } from '@/auth/session'
import { useSession } from '@/auth/useSession'

import { CUSTOMER_EMAIL } from '../helpers/render'

const Greeting = () => {
	const session = useSession()

	return <p>{session.signedIn ? `Signed in as ${session.email ?? 'a customer'}` : 'Signed out'}</p>
}

describe('useSession', () => {
	it('reads the store as it stands at mount', () => {
		setSession(CUSTOMER_EMAIL)
		const { result } = renderHook(() => useSession())

		expect(result.current).toEqual({ signedIn: true, email: CUSTOMER_EMAIL })
	})

	it('reads signed out for a visitor', () => {
		const { result } = renderHook(() => useSession())

		expect(result.current).toEqual({ signedIn: false, email: null })
	})

	/*
	 * The whole reason the store is external rather than React state: the auth exchange ends a session
	 * from inside a fetch, with no component in scope, and every component reading it has to follow.
	 */
	it('re-renders when the store changes under it', () => {
		render(<Greeting />)

		expect(screen.getByText('Signed out')).toBeInTheDocument()

		act(() => {
			setSession(CUSTOMER_EMAIL)
		})

		expect(screen.getByText(`Signed in as ${CUSTOMER_EMAIL}`)).toBeInTheDocument()
	})

	it('re-renders when the session ends', () => {
		setSession(CUSTOMER_EMAIL)
		render(<Greeting />)

		act(() => {
			clearSession()
		})

		expect(screen.getByText('Signed out')).toBeInTheDocument()
	})

	it('shows a signed-in customer whose address is not known yet', () => {
		render(<Greeting />)

		act(() => {
			setSession(null)
		})

		expect(screen.getByText('Signed in as a customer')).toBeInTheDocument()
	})

	// Two components read one store — the header and whatever the route rendered — and both have to move
	// together, or the page shows a signed-out header above signed-in content.
	it('moves every reader at once', () => {
		render(
			<>
				<Greeting />
				<Greeting />
			</>
		)

		act(() => {
			setSession(CUSTOMER_EMAIL)
		})

		expect(screen.getAllByText(`Signed in as ${CUSTOMER_EMAIL}`)).toHaveLength(2)
	})

	/*
	 * `useSyncExternalStore` compares snapshots by identity, so a store handing back a fresh object per
	 * read would re-render this component forever. React detects it and throws "The result of getSnapshot
	 * should be cached to avoid an infinite loop" — this asserts a repeat render is stable rather than
	 * that error.
	 */
	it('does not loop on a stable store', () => {
		const { result, rerender } = renderHook(() => useSession())
		const first = result.current

		rerender()

		expect(result.current).toBe(first)
	})

	// The unsubscribe is React's, on unmount. Without it every mounted-then-unmounted page would leave a
	// listener behind and the set would grow for as long as the tab is open.
	it('stops listening once the component is gone', () => {
		const { unmount } = render(<Greeting />)
		unmount()

		// No act() wrapper: nothing should be listening, so nothing should try to render.
		expect(() => {
			setSession(CUSTOMER_EMAIL)
		}).not.toThrow()
	})
})
