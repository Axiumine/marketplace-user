import { getRouteApi } from '@tanstack/react-router'
import { z } from 'zod'

import { CompaniesDocument } from '@/api/operations/publicResource/queries'
import { runQuery } from '@/api/run'
import { Breadcrumbs } from '@/features/catalogue/Breadcrumbs'
import { EmptyState } from '@/features/catalogue/EmptyState'
import { Pagination } from '@/features/catalogue/Pagination'
import { ShopGrid } from '@/features/catalogue/ShopGrid'
import { formatTotal } from '@/lib/format'
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScripts } from '@/lib/jsonLd'
import { offsetOf, PAGE_SIZE, pageLinks, pageNumber } from '@/lib/pagination'
import { absoluteUrl, headFor } from '@/lib/seo'
import type { RouterContext } from '@/router'

/**
 * `/shops` — every published shop, paginated.
 *
 * This is the page that carries the catalogue's crawl budget: it is one hop from the home page and it
 * links to every shop detail page through `rel="next"`. Two things follow from that and neither is
 * optional. The pagination is real `<a href>`s with a `?page=` query, not a "load more" button — a
 * crawler does not click. And `rel="prev"` / `rel="next"` are emitted in `head()`, which is what tells a
 * crawler the pages are one sequence rather than 400 near-duplicates competing with each other.
 */
const route = getRouteApi('/shops/')

/**
 * The only search parameter, and it is coerced rather than parsed strictly.
 *
 * `?page=abc` and `?page=-3` both land on page 1 instead of throwing, because these URLs are typed by
 * hand, linked from elsewhere and rewritten by every share button on the internet. An error boundary
 * for a bad page number would be a 500 where a crawler expected a listing. `catch` gives the same
 * answer for a missing parameter and for a nonsensical one, which is also what `pageNumber` does with
 * the value afterwards.
 *
 * ⚠️ **`.optional()` on the outside is load-bearing, and not for parsing.** It is what makes the
 * router's `search` prop optional on a `<Link to="/shops">`: TanStack derives that requirement from the
 * *output* type, and `.catch(1)` alone produces a non-optional `number`, so every link to this route —
 * the header, the footer, the home page — would have to pass `search={{ page: 1 }}` and would then emit
 * `/shops?page=1`. That is a second URL for page 1, competing with `/shops` in the index and
 * disagreeing with the canonical this very file emits. Optional in, normalised at the one place that
 * reads it (`loaderDeps` below). Every paginated route here does the same.
 */
const searchSchema = z.object({
	page: z.coerce.number().int().min(1).catch(1).optional()
})

export type ShopsSearch = z.infer<typeof searchSchema>

/**
 * The trail, written once and read twice — by the `BreadcrumbList` in the head and by the `<nav>` in the
 * page. `Breadcrumbs` says in its own header that the two must agree; the way to make them agree is not
 * to have two lists. A route that keeps a separate copy for the crawler tells it one thing and the
 * visitor another, and nothing here would notice.
 *
 * It does not depend on the page number: a paginated slice of one listing is the same place in the
 * hierarchy as its first page, and putting `page 3` in the trail invites a crawler to treat it as a
 * level of its own.
 */
const CRUMBS = [
	{ name: 'Home', path: '/' },
	{ name: 'Shops', path: '/shops' }
]

const loader = async ({ context, deps }: { context: RouterContext; deps: { page: number } }) => {
	const page = pageNumber(deps.page)

	const data = await runQuery(context.gql, CompaniesDocument, {
		limit: PAGE_SIZE,
		offset: offsetOf(page)
	})

	return { companies: data.companies, page }
}

type LoaderData = Awaited<ReturnType<typeof loader>>

/**
 * ⚠️ Page 2 and beyond are `noindex`, and that is a deliberate trade rather than an oversight.
 *
 * A deep listing page has no content of its own — the same heading, the same intro, a different slice of
 * cards — so it competes with page 1 for the same query and usually loses to it. What matters is that
 * the shop pages it links to stay reachable, and `noindex` does not stop a crawler from following links.
 * The canonical stays self-referential (never pointed at page 1): a canonical that lies about which page
 * this is invites the crawler to drop the page's links along with the page.
 */
const head = ({ loaderData }: { loaderData?: LoaderData }) => {
	const page = loaderData?.page ?? 1
	const nodes = loaderData?.companies.nodes ?? []
	const path = page === 1 ? '/shops' : `/shops?page=${String(page)}`

	const seo = headFor({
		title: page === 1 ? 'All shops' : `All shops — page ${String(page)}`,
		description: 'Every shop on the platform, with what they sell and where to find them.',
		path,
		noIndex: page > 1
	})

	const { prev, next } = pageLinks('/shops', page, loaderData?.companies.hasMore ?? false)

	return {
		...seo,
		links: [
			...seo.links,
			...(prev === undefined ? [] : [{ rel: 'prev', href: absoluteUrl(prev) }]),
			...(next === undefined ? [] : [{ rel: 'next', href: absoluteUrl(next) }])
		],
		scripts: jsonLdScripts(
			breadcrumbJsonLd(CRUMBS),
			// The offset makes the ItemList positions global rather than per page, so page 3 declares
			// positions 49–72. Restarting at 1 on every page tells a crawler it is looking at three
			// different lists that all begin with a first result.
			itemListJsonLd(
				nodes.map((company) => `/shop/${company.slug}`),
				offsetOf(page)
			)
		)
	}
}

const Shops = () => {
	const { companies, page } = route.useLoaderData()
	const { prev, next } = pageLinks('/shops', page, companies.hasMore)

	return (
		<div className="mx-auto max-w-6xl px-4 py-8">
			<Breadcrumbs crumbs={CRUMBS} />

			<h1 className="text-3xl font-semibold text-palette-bg">All shops</h1>
			<p className="mt-2 text-slate-600">{formatTotal(companies.total, companies.totalIsExact)} shops published.</p>

			<div className="mt-6">
				{companies.nodes.length === 0 ? (
					<EmptyState title="No shops on this page" hint="Try the first page." />
				) : (
					<ShopGrid companies={companies.nodes} />
				)}
			</div>

			<Pagination prev={prev} next={next} page={page} />
		</div>
	)
}

export const shopsRouteOptions = {
	validateSearch: searchSchema,
	// Without this the loader never re-runs on a page change: the router keys a loader's result by its
	// params, and `?page=` is not one. `loaderDeps` is what puts the search value into that key.
	//
	// `pageNumber` normalises here rather than in the loader, so an absent `?page=` and an explicit
	// `?page=1` produce the *same* key — they are the same page, and keying them apart would fetch and
	// cache it twice.
	loaderDeps: ({ search }: { search: ShopsSearch }) => ({ page: pageNumber(search.page) }),
	loader,
	head,
	component: Shops
}
