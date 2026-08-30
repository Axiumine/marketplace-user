import { vi } from 'vitest'

/**
 * Replaces `window.location` with a copy of itself whose `assign` is a spy, and answers the spy.
 *
 * ⚠️ Stubbing the whole global is the only way in. jsdom defines `assign` as non-configurable, so
 * `vi.spyOn(window.location, 'assign')` fails with *"Cannot redefine property: assign"*, and the real
 * one throws *"Not implemented: navigation"* — a test that let it run would pass while telling nobody
 * where the page went.
 *
 * `unstubGlobals` in vitest.config.ts puts the real `location` back after every test, so nothing here
 * leaks into the next file.
 */
export const stubLocationAssign = (): ReturnType<typeof vi.fn> => {
	const assign = vi.fn()
	vi.stubGlobal('location', { ...window.location, assign })

	return assign
}
