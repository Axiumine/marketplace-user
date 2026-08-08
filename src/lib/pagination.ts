/**
 * Page numbers in the URL, offsets on the wire.
 *
 * The URL carries `?page=2` because that is what a person reads, links to and a crawler follows; the
 * API takes `limit`/`offset`. Keeping the translation in one place is what stops a page from being
 * off by one page — the classic `offset = page * limit` with a 1-based page, which silently skips the
 * first `limit` results and is invisible on page 1.
 */

/** Items per listing page. One screen of cards, and small enough that page 1 is the LCP candidate. */
export const PAGE_SIZE = 24

/** 1-based, and clamped: `?page=0` and `?page=-3` are page 1, not an error and not an empty listing. */
export const pageNumber = (raw: number | undefined): number => {
	if (raw === undefined || !Number.isFinite(raw)) return 1
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
	const at = (target: number): string => (target === 1 ? basePath : `${basePath}?page=${String(target)}`)

	const links: { prev?: string; next?: string } = {}
	if (current > 1) links.prev = at(current - 1)
	if (hasMore) links.next = at(current + 1)

	return links
}
