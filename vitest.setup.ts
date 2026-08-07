import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect } from 'vitest'

import { clearAccessToken } from '@/api/tokenStore'
import { clearSession } from '@/auth/session'

/** React's `useId` output, in both the `_r_1_` and the `«r1»` spelling. */
const GENERATED_ID = /_r_[0-9a-z]+_|«r[0-9a-z]+»/g

/** Attributes that hold one, either as the id itself or as a reference to it. */
const ID_ATTRS = ['id', 'for', 'aria-labelledby', 'aria-describedby', 'aria-controls']

/** Clones already rewritten, so the recursion into children does not clone the same subtree again. */
const normalised = new WeakSet<Element>()

const rewrite = (element: Element, stable: Map<string, string>): void => {
	normalised.add(element)

	for (const attribute of ID_ATTRS) {
		const value = element.getAttribute(attribute)
		if (value === null) continue

		element.setAttribute(
			attribute,
			value.replace(GENERATED_ID, (generated) => {
				const known = stable.get(generated)
				if (known !== undefined) return known

				const token = `:id-${String(stable.size)}:`
				stable.set(generated, token)
				return token
			})
		)
	}
}

/*
 * React counts `useId` per test *file*, so inserting a test above a snapshot renumbers every `id` and
 * `aria-labelledby` in a snapshot nobody touched. This renumbers both ends from zero per snapshot: the
 * pairing an `aria-labelledby` depends on still diffs, the counter does not.
 */
expect.addSnapshotSerializer({
	test: (value: unknown) => value instanceof Element && !normalised.has(value),
	serialize: (value, config, indentation, depth, refs, printer) => {
		const clone = (value as Element).cloneNode(true) as Element
		const stable = new Map<string, string>()

		rewrite(clone, stable)
		for (const descendant of clone.querySelectorAll('*')) rewrite(descendant, stable)

		return printer(clone, config, indentation, depth, refs)
	}
})

/*
 * The router is created with `scrollRestoration: true`, which calls `window.scrollTo` on every
 * navigation. jsdom's own implementation throws `Not implemented`, which surfaces as a console error on
 * a test that navigated correctly.
 */
window.scrollTo = () => {
	/* no layout to scroll in jsdom */
}

/*
 * MapLibre asks for both on construction. jsdom answers neither, and the failure is a `TypeError` from
 * inside the map island rather than anything a test could read.
 */
window.matchMedia ??= ((query: string) =>
	({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => undefined,
		removeListener: () => undefined,
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
		dispatchEvent: () => false
	}) as unknown as MediaQueryList) as typeof window.matchMedia

globalThis.ResizeObserver ??= class {
	observe(): void {
		/* nothing to measure in jsdom */
	}
	unobserve(): void {
		/* nothing to measure in jsdom */
	}
	disconnect(): void {
		/* nothing to measure in jsdom */
	}
} as unknown as typeof ResizeObserver

/*
 * Both stores are module-scoped, so they survive a `cleanup()` and leak into the next test in the file.
 * Cleared before each rather than after, so a test that seeds one in its own body is not undone by the
 * teardown of the test before it.
 */
beforeEach(() => {
	clearAccessToken()
	clearSession()
})

afterEach(() => {
	cleanup()
})
