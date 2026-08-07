import { getRouteApi, notFound } from '@tanstack/react-router'
import { z } from 'zod'

import { CompanyBySlugDocument, ItemsDocument } from '@/api/operations/publicResource/queries'
import { runQuery } from '@/api/run'
import { Breadcrumbs } from '@/features/catalogue/Breadcrumbs'
import { EmptyState } from '@/features/catalogue/EmptyState'
import { ItemGrid } from '@/features/catalogue/ItemGrid'
import { Pagination } from '@/features/catalogue/Pagination'
import { MapIsland } from '@/features/map/MapIsland'
import { formatTotal } from '@/lib/format'
import { toLngLat } from '@/lib/geo'
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScripts, storeJsonLd } from '@/lib/jsonLd'
import { offsetOf, PAGE_SIZE, pageLinks, pageNumber } from '@/lib/pagination'
import { absoluteUrl, headFor, truncate } from '@/lib/seo'
import type { RouterContext } from '@/router'

/**
 * `/shop/:slug` — one shop, its address, its position on the map and its items.
 *
 * The page the whole SSR argument is about: `Store` JSON-LD with a real `geo` block is what puts a shop
 * into a local-results panel, and a crawler that has to run JavaScript to find it usually does not.
 * `curl`ing this URL and grepping for `"@type":"Store"` is the acceptance test in the README.
 */
const route = getRouteApi('/shop/$slug/')

/** One pin, so the map opens on the shop rather than on the country. */
const SHOP_ZOOM = 15

const searchSchema = z.object({
	page: z.coerce.number().int().min(1).catch(1).optional()
})

export type ShopSearch = z.infer<typeof searchSchema>

/**
 * The trail, written once and read twice — by the `BreadcrumbList` in the head and by the `<nav>` in the
 * page. `Breadcrumbs` says in its own header that the two must agree; the way to make them agree is not to
 * have two lists. Duplicating them is how a route ends up telling a crawler one path and a visitor another.
 */
const crumbsFor = (company: { readonly publicName: string; readonly slug: string }) => [
	{ name: 'Home', path: '/' },
	{ name: 'Shops', path: '/shops' },
	{ name: company.publicName, path: `/shop/${company.slug}` }
]

const loader = async ({
	context,
	params,
	deps
}: {
	context: RouterContext
	params: { slug: string }
	deps: { page: number }
}) => {
	const page = pageNumber(deps.page)

	// Sequential on purpose, unlike the home page's pair: the item query is pointless if the shop does
	// not exist, and firing both would spend a text-index walk on a 404 that a crawler can request as
	// often as it likes.
	const shop = await runQuery(context.gql, CompanyBySlugDocument, { slug: params.slug })
	const company = shop.companyBySlug
	if (company === null || company === undefined) throw notFound()

	const items = await runQuery(context.gql, ItemsDocument, {
		companySlug: company.slug,
		limit: PAGE_SIZE,
		offset: offsetOf(page)
	})

	return { company, items: items.items, page }
}

type LoaderData = Awaited<ReturnType<typeof loader>>

const head = ({ loaderData }: { loaderData?: LoaderData }) => {
	// The whole object is the guard, not `loaderData?.company`: the loader throws `notFound()` on a missing
	// shop, so a `loaderData` that exists always carries one and the per-field fallbacks below would be
	// branches no request can take.
	if (loaderData === undefined) return headFor({ title: 'Shop', description: '', path: '/shops' })

	const { company, page } = loaderData
	const basePath = `/shop/${company.slug}`
	const path = page === 1 ? basePath : `${basePath}?page=${String(page)}`
	const where = `${company.address.street}, ${company.address.postalCode} ${company.address.city}`

	const seo = headFor({
		title: page === 1 ? company.publicName : `${company.publicName} — page ${String(page)}`,
		// The address is in the description because that is the part of the snippet a person scans for
		// when the query was local. The shop's own description follows it when there is one.
		description: truncate(company.description ? `${where}. ${company.description}` : where),
		path,
		noIndex: page > 1
	})

	const { prev, next } = pageLinks(basePath, page, loaderData.items.hasMore)

	return {
		...seo,
		links: [
			...seo.links,
			...(prev === undefined ? [] : [{ rel: 'prev', href: absoluteUrl(prev) }]),
			...(next === undefined ? [] : [{ rel: 'next', href: absoluteUrl(next) }])
		],
		scripts: jsonLdScripts(
			storeJsonLd(company),
			breadcrumbJsonLd(crumbsFor(company)),
			itemListJsonLd(
				loaderData.items.nodes.map((item) => `/shop/${company.slug}/item/${item.slug}`),
				offsetOf(page)
			)
		)
	}
}

const Shop = () => {
	const { company, items, page } = route.useLoaderData()
	const { prev, next } = pageLinks(`/shop/${company.slug}`, page, items.hasMore)

	// `undefined` covers both "the company has no position" and "it has one that is not a plottable pair".
	// Both render the page without a map, which is the right outcome for each.
	const center = toLngLat(company.address.position?.coordinates)
	const description = company.description ?? ''

	return (
		<div className="mx-auto max-w-6xl px-4 py-8">
			<Breadcrumbs crumbs={crumbsFor(company)} />

			<h1 className="mt-4 text-3xl font-semibold text-palette-bg">{company.publicName}</h1>

			<address className="mt-2 not-italic text-slate-600">
				{company.address.street}
				<br />
				{company.address.postalCode} {company.address.city} ({company.address.province})
			</address>

			{/* Coalesced to a string first: `description` is nullable on the wire *and* optional in the type, so
			    testing it three ways spells out two branches that no request can tell apart. One comparison. */}
			{description !== '' && <p className="mt-4 max-w-3xl text-slate-700">{description}</p>}

			{center !== undefined && (
				<div className="mt-6">
					<MapIsland
						center={center}
						zoom={SHOP_ZOOM}
						initialPins={[
							{
								_id: company._id,
								publicName: company.publicName,
								slug: company.slug,
								coordinates: center
							}
						]}
					/>
				</div>
			)}

			<section aria-label="Items" className="mt-8">
				<h2 className="text-xl font-semibold text-palette-bg">
					Items <span className="text-slate-500">({formatTotal(items.total, items.totalIsExact)})</span>
				</h2>

				<div className="mt-4">
					{items.nodes.length === 0 ? (
						<EmptyState title="This shop has not published any item yet" />
					) : (
						<ItemGrid items={items.nodes} />
					)}
				</div>

				<Pagination prev={prev} next={next} page={page} />
			</section>
		</div>
	)
}

export const shopRouteOptions = {
	validateSearch: searchSchema,
	loaderDeps: ({ search }: { search: ShopSearch }) => ({ page: pageNumber(search.page) }),
	loader,
	head,
	component: Shop
}
