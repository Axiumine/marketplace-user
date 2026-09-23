import { getRouteApi, notFound } from '@tanstack/react-router'
import { z } from 'zod'

import { CompaniesDocument } from '@/api/operations/publicResource/queries'
import { runQuery } from '@/api/run'
import { Breadcrumbs } from '@/features/catalogue/Breadcrumbs'
import { EmptyState } from '@/features/catalogue/EmptyState'
import { Pagination } from '@/features/catalogue/Pagination'
import { ShopGrid } from '@/features/catalogue/ShopGrid'
import { formatTotal } from '@/lib/format'
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScripts } from '@/lib/jsonLd'
import { maxPageFor, offsetOf, PAGE_SIZE, pageLinks, pageNumber } from '@/lib/pagination'
import { absoluteUrl, headFor } from '@/lib/seo'
import type { RouterContext } from '@/router'

/**
 * `/shops/:city` — the same listing, narrowed to one city.
 *
 * ⚠️ **The segment is the city name itself, not a slug**, because the resolver matches
 * `address.city` for exact equality and there is no slug column to match instead. So the URL is
 * `/shops/Reggio%20Emilia`, and every link to it has to pass `company.address.city` verbatim —
 * lowercasing it, stripping its accents or hyphenating its spaces produces a page that renders with
 * zero results and no error anywhere. Adding a `citySlug` to `company` is the fix if these URLs ever
 * need to be prettier; a `$regex` here is not, it cannot use the compound index the listing depends on.
 *
 * These pages exist for the search query nobody types on the home page: "shops in <city>". They are
 * indexable and they are the only place that intent has a landing page.
 */
const route = getRouteApi('/shops/$city')

const searchSchema = z.object({
	page: z.coerce.number().int().min(1).catch(1).optional()
})

export type ShopsCitySearch = z.infer<typeof searchSchema>

/**
 * The path the whole page is built around: the canonical, the pagination links, the last crumb and every
 * `<a href>` in the trail all derive from this one string, so the `encodeURIComponent` happens once.
 */
const cityPath = (city: string) => `/shops/${encodeURIComponent(city)}`

/**
 * The trail, written once and read twice — by the `BreadcrumbList` in the head and by the `<nav>` in the
 * page. `Breadcrumbs` says in its own header that the two must agree; the way to make them agree is not
 * to have two lists. Duplicating them is how a route tells a crawler one path and a visitor another.
 */
const crumbsFor = (city: string) => [
	{ name: 'Home', path: '/' },
	{ name: 'Shops', path: '/shops' },
	{ name: city, path: cityPath(city) }
]

/**
 * Mirrors `MAX_OFFSET` in `marketplace-dev-public-resource`'s `publicRead.mts` — the offset cap
 * `companies` enforces. Past it the backend throws instead of clamping; this is what keeps a `?page=`
 * deep enough to trigger that throw from ever reaching it.
 */
const MAX_PAGE = maxPageFor(10_000)

const loader = async ({
	context,
	params,
	deps
}: {
	context: RouterContext
	params: { city: string }
	deps: { page: number }
}) => {
	const page = pageNumber(deps.page)
	const city = params.city.trim()

	// ⚠️ A different failure from the one the comment below explains: a real city's page 9 empties on
	// purpose, because the backend can still answer it. A page past `MAX_PAGE` is one the backend cannot
	// answer for *any* city — it throws on the offset alone — so this checks before the query runs rather
	// than after.
	if (page > MAX_PAGE) throw notFound()

	const data = await runQuery(context.gql, CompaniesDocument, {
		limit: PAGE_SIZE,
		offset: offsetOf(page),
		city
	})

	// ⚠️ 404 on an empty first page, rather than an empty listing. A city with no published shops is not
	// a page that should exist: left as a 200 it is an indexable, contentless URL, and anyone can mint
	// an unlimited number of them by typing nonsense into the segment. Later pages are exempt — an
	// out-of-range `?page=` on a real city is a bad parameter, not a missing city, and the page below
	// says so.
	if (data.companies.nodes.length === 0 && page === 1) throw notFound()

	return { companies: data.companies, city, page }
}

type LoaderData = Awaited<ReturnType<typeof loader>>

const head = ({ loaderData }: { loaderData?: LoaderData }) => {
	const city = loaderData?.city ?? ''
	const page = loaderData?.page ?? 1
	const nodes = loaderData?.companies.nodes ?? []
	const basePath = cityPath(city)
	const path = page === 1 ? basePath : `${basePath}?page=${String(page)}`

	const seo = headFor({
		title: page === 1 ? `Shops in ${city}` : `Shops in ${city} — page ${String(page)}`,
		description: `Every shop published in ${city}, with what they sell and where to find them.`,
		path,
		noIndex: page > 1
	})

	const { prev, next } = pageLinks(basePath, page, loaderData?.companies.hasMore ?? false)

	return {
		...seo,
		links: [
			...seo.links,
			...(prev === undefined ? [] : [{ rel: 'prev', href: absoluteUrl(prev) }]),
			...(next === undefined ? [] : [{ rel: 'next', href: absoluteUrl(next) }])
		],
		scripts: jsonLdScripts(
			breadcrumbJsonLd(crumbsFor(city)),
			itemListJsonLd(
				nodes.map((company) => `/shop/${company.slug}`),
				offsetOf(page)
			)
		)
	}
}

const ShopsCity = () => {
	const { companies, city, page } = route.useLoaderData()
	const { prev, next } = pageLinks(cityPath(city), page, companies.hasMore)

	return (
		<div className="mx-auto max-w-6xl px-4 py-8">
			<Breadcrumbs crumbs={crumbsFor(city)} />

			<h1 className="mt-4 text-3xl font-semibold text-palette-bg">Shops in {city}</h1>
			<p className="mt-2 text-slate-600">{formatTotal(companies.total, companies.totalIsExact)} shops here.</p>

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

export const shopsCityRouteOptions = {
	validateSearch: searchSchema,
	loaderDeps: ({ search }: { search: ShopsCitySearch }) => ({ page: pageNumber(search.page) }),
	loader,
	head,
	component: ShopsCity
}
