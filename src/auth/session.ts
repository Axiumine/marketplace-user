/**
 * Who is signed in, as far as this browser tab knows.
 *
 * A tiny external store rather than React state, for the same reason `tokenStore` is a module
 * variable: the auth exchange has to be able to end a session from inside a fetch, with no component
 * in scope. `useSyncExternalStore` then lets any component read it without prop-drilling and without a
 * context provider around the whole tree.
 *
 * ⚠️ **Never written during a server render, and this is load-bearing in an SSR app.** Module state on
 * the server is shared by every concurrent request, so a signed-in session written here while rendering
 * would be visible to the next visitor the process serves. The invariant is about *writes* and about
 * *server-rendered output*, not about the import graph: `setSession` is only ever called from a browser
 * event handler (the login form's submit, the auth exchange's failure path), and `getServerSession`
 * makes every server render read signed-out regardless of what any other request did. That is why
 * `Header` — rendered on every public page — may read it, and why the SSR'd login route may import the
 * form that writes it.
 *
 * What is genuinely forbidden is a *loader* or a `head()` touching this file: those run on the server
 * with the shared module in scope, and branching HTML on it would serve one visitor's state to another.
 * The private routes sidestep the question entirely by being `ssr: false` — they only ever mount in a
 * browser, where module state is per tab.
 *
 * ⚠️ **This is not an authorisation check.** `signedIn` says "we hold an access token", nothing more.
 * Every private query is authorised server-side against the Redis session; flipping this flag in a
 * console grants access to no data. It exists to decide what to render while the server decides what
 * to answer.
 *
 * Nothing survives a reload — the module is rebuilt — which is correct: the access token does not
 * survive one either, and the refresh cookie is what restores both.
 */
export interface Session {
	readonly signedIn: boolean
	/**
	 * The address the customer typed at login, or null.
	 *
	 * Null after every reload, and that is expected rather than a gap: the login form is the only place
	 * this app learns it before `me` answers. It is kept here instead of in the URL because a URL is
	 * written to browser history and sent in every referrer header the app leaks — an email address does
	 * not belong in either.
	 */
	readonly email: string | null
}

const SIGNED_OUT: Session = Object.freeze({ signedIn: false, email: null })

let current: Session = SIGNED_OUT

const listeners = new Set<() => void>()

const emit = (next: Session): void => {
	current = next
	for (const listener of listeners) listener()
}

export const getSession = (): Session => current

export const setSession = (email: string | null): void => {
	emit(Object.freeze({ signedIn: true, email }))
}

export const clearSession = (): void => {
	emit(SIGNED_OUT)
}

/**
 * `useSyncExternalStore` requires a stable snapshot: it compares the previous and next values by
 * identity and re-renders on a change. Returning a fresh object per call would loop forever, which is
 * why `current` is replaced rather than mutated and why the two states are frozen.
 */
export const subscribeSession = (listener: () => void): (() => void) => {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

/**
 * The server's snapshot, for the one case where a private component is rendered outside a browser: a
 * test, or a stray import from an SSR path. Always signed out — the server has no session to report,
 * and inventing one would produce HTML that contradicts the first client render.
 */
export const getServerSession = (): Session => SIGNED_OUT
