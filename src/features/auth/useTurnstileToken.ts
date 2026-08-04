import { useCallback, useRef, useState } from 'react'

/**
 * Holds the Turnstile token for one form.
 *
 * Two things it exists to get right:
 *
 * - **`onToken` is stable.** `Turnstile` lists it in an effect dependency, so a fresh function per
 *   render would unmount and re-render the widget on every keystroke in the surrounding form — which
 *   also discards the token the customer already earned.
 * - **The token is read through a ref at submit time, not through the state value.** A widget that
 *   solves itself between the click and the `await` would otherwise be missed, and a token that expired
 *   in that window would be sent anyway. State is still kept because the button's disabled state has to
 *   re-render when a token arrives.
 *
 * `null` is a legitimate value to submit: it is what a machine with no site key configured always sends,
 * and the server accepts it in exactly that case. See the note in `Turnstile.tsx`.
 */
export interface TurnstileToken {
	readonly token: string | null
	readonly onToken: (token: string | null) => void
	readonly read: () => string | null
}

export const useTurnstileToken = (): TurnstileToken => {
	const [token, setToken] = useState<string | null>(null)
	const latest = useRef<string | null>(null)

	const onToken = useCallback((next: string | null) => {
		latest.current = next
		setToken(next)
	}, [])

	const read = useCallback(() => latest.current, [])

	return { token, onToken, read }
}
