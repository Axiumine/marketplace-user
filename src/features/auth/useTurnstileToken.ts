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
 *
 * ⚠️ **`reset` exists because the server spends the token before it validates anything else.**
 * `guardPublicWrite`/`guardPublicLogin` verify with Cloudflare on the first attempt, so a submit refused
 * for any other reason — a wrong password, a taken address — leaves the widget holding a token Cloudflare
 * has already marked used. Resubmitting with it fails as a duplicate no matter how the rest of the form
 * was fixed, until the token expires on its own (~300 s) or the page reloads. `resetKey` is what a form
 * pairs with `reset()`: passed as `<Turnstile key={turnstile.resetKey} …>`, bumping it remounts the
 * widget and gets a token Cloudflare has not seen yet.
 */
export interface TurnstileToken {
	readonly token: string | null
	readonly resetKey: number
	readonly onToken: (token: string | null) => void
	readonly read: () => string | null
	/** Withdraws the current token and bumps `resetKey`, forcing a fresh widget on the next render. */
	readonly reset: () => void
}

export const useTurnstileToken = (): TurnstileToken => {
	const [token, setToken] = useState<string | null>(null)
	const [resetKey, setResetKey] = useState(0)
	const latest = useRef<string | null>(null)

	/*
	 * ⚠️ The two empty dependency arrays are excluded from mutation testing, and this is the one place in
	 * the repo where that is true — so it needs its reason written down rather than assumed.
	 *
	 * Stryker's `ArrayDeclaration` mutator rewrites `[]` as `['Stryker was here']`, and React compares
	 * dependency lists element by element with `Object.is`. A list whose single element is the same string
	 * literal on every render compares equal on every render, so both callbacks keep the identity they had
	 * — the mutant produces the same behaviour as the original, for every input, and no test can tell them
	 * apart. It is an equivalent mutant, not a gap: the stability it appears to attack is asserted four
	 * times in `useTurnstileToken.test.tsx`, across a re-render, a token arrival and a closure created
	 * before one.
	 *
	 * Scoped to this mutator and these two lines. A non-empty dependency list mutated the same way *does*
	 * change behaviour — it stops tracking what it named — and stays under the gate everywhere else.
	 */
	// Stryker disable ArrayDeclaration
	const onToken = useCallback((next: string | null) => {
		latest.current = next
		setToken(next)
	}, [])

	const read = useCallback(() => latest.current, [])
	// Stryker restore ArrayDeclaration

	// Not `useCallback`: nothing reads its identity across renders — it is called directly from a submit
	// handler, never listed in an effect's dependency array — so there is no stability to buy and no
	// equivalent-mutant argument to write down for it, unlike the two callbacks above.
	const reset = () => {
		latest.current = null
		setToken(null)
		setResetKey((key) => key + 1)
	}

	return { token, resetKey, onToken, read, reset }
}
