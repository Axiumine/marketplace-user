/**
 * Page numbers in the URL, offsets on the wire.
 *
 * The URL carries `?page=2` because that is what a person reads, links to and a crawler follows; the
 * API takes `limit`/`offset`. Keeping the translation in one place is what stops a page from being
 * off by one page — the classic `offset = page * limit` with a 1-based page, which silently skips the
 * first `limit` results and is invisible on page 1.
 */

import { isFiniteNumber } from '@/lib/number'

/** Items per listing page. One screen of cards, and small enough that page 1 is the LCP candidate. */
export const PAGE_SIZE = 24

/** 1-based, and clamped: `?page=0` and `?page=-3` are page 1, not an error and not an empty listing. */
export const pageNumber = (raw: number | undefined): number => {
	// One check, not two. The `raw === undefined` disjunct that used to lead this line was unreachable in
	// the only sense that matters: `Number.isFinite(undefined)` is already `false`, so every value the
	// first test rejected was rejected by the second anyway. It existed to narrow `number | undefined`
	// for `Math.trunc` below, which `isFiniteNumber` now does — see src/lib/number.ts.
	if (!isFiniteNumber(raw)) return 1
	return Math.max(1, Math.trunc(raw))
}

export const offsetOf = (page: number, size: number = PAGE_SIZE): number => (pageNumber(page) - 1) * size

/**
 * The `rel="prev"` / `rel="next"` pair a listing emits, as paths.
 *
 * `hasMore` comes from the resolver rather than being derived from `total`, which matters because
 * `total` is capped: on a large result set it is the cap, and computing "is there a next page" from it
 * would truncate the listing at whatever the cap happens to be.
 */
export interface PageLinks {
	readonly prev?: string
	readonly next?: string
}

export const pageLinks = (basePath: string, page: number, hasMore: boolean): PageLinks => {
	const current = pageNumber(page)

	// ⚠️ `basePath` may already carry a query string — `/search?q=lamp&kind=items` is one listing among
	// many, keyed by what was typed rather than by a path segment. Appending `?page=` to it would produce
	// a second `?` and a URL whose page number is part of the *value* of `kind`, silently: the router
	// parses `kind=items?page=2`, finds it is not a valid kind, falls back to the default, and every
	// "next" link lands back on page 1 of the wrong tab.
	const at = (target: number): string => {
		if (target === 1) return basePath

		return `${basePath}${basePath.includes('?') ? '&' : '?'}page=${String(target)}`
	}

	const links: { prev?: string; next?: string } = {}
	if (current > 1) links.prev = at(current - 1)
	if (hasMore) links.next = at(current + 1)

	return links
}
