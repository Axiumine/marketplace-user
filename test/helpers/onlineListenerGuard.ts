import { afterAll, beforeAll, expect } from 'vitest'

/**
 * Installs a file-wide regression guard for the `online`-listener leak every client-building test in
 * this suite has to close: every `online` listener registered through `window.addEventListener` while
 * this file's tests run must carry a signal that ends up aborted — the suite's proof that nothing here
 * is still relying on the caller to clean it up.
 *
 * Call it once at module scope in any test file that builds a `Client` — directly through
 * `createGraphQLClient`/`createRefreshBreaker`, through `getRouter`, or through `renderWithClient`,
 * `renderWithRouter` or `renderRoute` in `test/helpers/render.tsx` — so the `beforeAll`/`afterAll` pair
 * below wraps that file's whole suite. The caller still owns aborting its own controller(s) in its own
 * `afterEach`/`afterAll`; this only asserts that it did.
 *
 * ⚠️ This checks the signal's `aborted` flag rather than counting `window.removeEventListener` calls.
 * jsdom's `AbortSignal` integration removes a listener internally when its signal fires — it never calls
 * the target's own `removeEventListener` to do it — so patching that method the way this probes
 * `addEventListener` would see zero removals even on a correctly cleaned-up suite, exactly the shape of a
 * false leak report.
 *
 * A plain reassignment rather than `vi.spyOn`: this config sets `restoreMocks: true`, which restores every
 * `vi.spyOn` wrapper before the *next* test — so a spy installed once in `beforeAll` would only ever see
 * the first test's calls. Wrapping the method by hand and putting it back in `afterAll` keeps the same
 * list live for the whole file regardless of that per-test restoration.
 */
export const installOnlineListenerGuard = (): void => {
	const onlineRegistrations: (AbortSignal | undefined)[] = []
	const realAddEventListener = window.addEventListener.bind(window)

	beforeAll(() => {
		window.addEventListener = (
			type: string,
			listener: EventListenerOrEventListenerObject,
			options?: boolean | AddEventListenerOptions
		): void => {
			if (type === 'online') onlineRegistrations.push(typeof options === 'object' ? options?.signal : undefined)
			realAddEventListener(type, listener, options)
		}
	})

	afterAll(() => {
		window.addEventListener = realAddEventListener

		expect(onlineRegistrations.length).toBeGreaterThan(0)
		expect(onlineRegistrations.every((signal) => signal?.aborted === true)).toBe(true)
	})
}
