import { Link } from '@tanstack/react-router'

/**
 * The router's `defaultNotFoundComponent`.
 *
 * Rendered whenever a loader throws `notFound()` — an unknown slug, a category that does not exist, a
 * shop that was unpublished between the crawl and the visit. The framework answers HTTP 404 with this
 * markup, which is the whole point: a 200 carrying "not found" text is a soft 404, and a crawler indexes
 * it as a real page.
 *
 * `noindex` is not set here. It would be redundant on a genuine 404 — the status code already says it —
 * and a `<meta>` tag cannot be trusted to arrive before the status line anyway.
 */
export const NotFound = () => (
	<main className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-24">
		<p className="text-sm font-medium text-slate-500">404</p>
		<h1 className="text-3xl font-semibold text-slate-900">This page does not exist</h1>
		<p className="text-slate-600">The address may be mistyped, or the shop it pointed at may no longer be published.</p>
		<Link to="/" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
			Back to the home page
		</Link>
	</main>
)
