import { describe, expect, it } from 'vitest'

import { offsetOf, PAGE_SIZE, pageLinks, pageNumber } from '@/lib/pagination'

describe('pageNumber', () => {
	it('reads a page straight through', () => {
		expect(pageNumber(3)).toBe(3)
	})

	/*
	 * `?page=0` is not an error and not an empty listing. The search param is `.catch(1).optional()`, so
	 * anything unparseable is already 1 by the time it arrives — what reaches here is a number a visitor
	 * typed, and the only useful answer to "page zero" is the first one.
	 */
	it.each([
		['undefined', undefined, 1],
		['zero', 0, 1],
		['a negative page', -3, 1],
		['a fractional page', 2.7, 2],
		['a negative fraction', -0.5, 1],
		['NaN', Number.NaN, 1],
		['Infinity', Number.POSITIVE_INFINITY, 1]
	])('clamps %s to %i', (_label, raw, expected) => {
		expect(pageNumber(raw)).toBe(expected)
	})

	// Truncation, not rounding: 2.7 is somewhere inside page 2, and rounding it up would skip page 2's
	// second half entirely.
	it('truncates towards zero rather than rounding', () => {
		expect(pageNumber(2.9)).toBe(2)
	})
})

describe('offsetOf', () => {
	/*
	 * The one bug this module exists to prevent: `offset = page * limit` with a 1-based page silently
	 * skips the first screen of results and looks perfectly correct on page 1, where both formulas would
	 * have to agree anyway. Page 1 is therefore asserted at zero *and* page 2 at exactly one page in.
	 */
	it('starts page 1 at the top of the list', () => {
		expect(offsetOf(1)).toBe(0)
	})

	it('starts page 2 one page in, not two', () => {
		expect(offsetOf(2)).toBe(PAGE_SIZE)
		expect(offsetOf(2)).toBe(24)
	})

	it('clamps the page the same way `pageNumber` does', () => {
		expect(offsetOf(0)).toBe(0)
		expect(offsetOf(-5)).toBe(0)
	})

	it('takes a page size for a listing that is not the default one', () => {
		expect(offsetOf(3, 10)).toBe(20)
	})
})

describe('pageLinks', () => {
	it('offers no previous link on page 1', () => {
		expect(pageLinks('/shops', 1, true)).toEqual({ next: '/shops?page=2' })
	})

	it('offers no next link when the resolver said there is no more', () => {
		expect(pageLinks('/shops', 2, false)).toEqual({ prev: '/shops' })
	})

	it('offers both in the middle of a listing', () => {
		expect(pageLinks('/shops', 3, true)).toEqual({ prev: '/shops?page=2', next: '/shops?page=4' })
	})

	/*
	 * Page 1 is the bare path, never `?page=1`. Two URLs answering with the same HTML compete in the
	 * index, and `rel="prev"` pointing at the parameterised spelling is what creates the duplicate — the
	 * canonical on that page says the bare path, so the crawler is told two different things.
	 */
	it('links back to page 1 without a query string', () => {
		expect(pageLinks('/shops', 2, true).prev).toBe('/shops')
	})

	it('keeps the base path it was given, including one that already has segments', () => {
		expect(pageLinks('/category/pane/focacce', 2, true)).toEqual({
			prev: '/category/pane/focacce',
			next: '/category/pane/focacce?page=3'
		})
	})

	it('answers an empty object for a single-page listing', () => {
		expect(pageLinks('/shops', 1, false)).toEqual({})
	})

	it('clamps the page before deciding there is a previous one', () => {
		expect(pageLinks('/shops', 0, false)).toEqual({})
	})
})
