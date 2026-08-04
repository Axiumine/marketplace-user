/**
 * Listing pagination.
 *
 * ⚠️ Plain `<a href>`, not `<Link>`. This is the one place in the app where that is correct, and it is
 * an SEO decision: `pageLinks` produces the same strings the `rel="prev"`/`rel="next"` head tags carry,
 * and a crawler follows an `href`. A `<Link>` renders an `href` too, so the difference is small — but
 * these two anchors are built from the *same* strings as the head links by construction, and keeping
 * them as strings is what guarantees the two can never disagree about what page 3's address is.
 *
 * The links are rendered even when JavaScript never runs, which is the state a crawler is usually in.
 */
// `| undefined` spelled out on both: `exactOptionalPropertyTypes: true` makes a bare `prev?: string`
// reject an explicit `undefined`, and every call site destructures `pageLinks(...)` and passes both
// values unconditionally — page 1 has no `prev`, the last page has no `next`, and that is the normal
// state rather than a reason to omit the prop.
export interface PaginationProps {
	readonly prev?: string | undefined
	readonly next?: string | undefined
	readonly page: number
}

export const Pagination = ({ prev, next, page }: PaginationProps) => {
	if (prev === undefined && next === undefined) return null

	return (
		<nav aria-label="Pagination" className="mt-8 flex items-center justify-between gap-4">
			{prev === undefined ? (
				<span />
			) : (
				<a href={prev} rel="prev" className="rounded-box border border-slate-300 bg-white px-4 py-2 text-sm">
					← Previous
				</a>
			)}
			<span className="text-sm text-slate-500">Page {page}</span>
			{next === undefined ? (
				<span />
			) : (
				<a href={next} rel="next" className="rounded-box border border-slate-300 bg-white px-4 py-2 text-sm">
					Next →
				</a>
			)}
		</nav>
	)
}
