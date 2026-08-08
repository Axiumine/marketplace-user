import { getRouteApi, Link } from '@tanstack/react-router'

import { CompaniesDocument, ItemCategoriesDocument } from '@/api/operations/publicResource/queries'
import { runQuery } from '@/api/run'
import { CategoryNav } from '@/features/catalogue/CategoryNav'
import { EmptyState } from '@/features/catalogue/EmptyState'
import { ShopCard } from '@/features/catalogue/ShopCard'
import { MapIsland } from '@/features/map/MapIsland'
import { nestCategories } from '@/lib/categories'
import { itemListJsonLd, jsonLdScripts, websiteJsonLd } from '@/lib/jsonLd'
import { headFor, SITE_NAME } from '@/lib/seo'
import type { RouterContext } from '@/router'

/**
 * The home page: a first screen of shops, the category tree, and the map.
 *
 * ⚠️ The shop cards are server-rendered and the map is not. That asymmetry is the SEO design of the whole
 * app in one page — every shop reachable from here is reachable as a crawlable `<a href>`, and the map is
 * a second, richer way to look at the same set. If the cards ever become client-only, the catalogue stops
 * being indexed and nothing about the page looks broken.
 *
 * `getRouteApi` rather than importing `Route` from `src/routes/`: the route file imports *this* module,
 * so importing it back would be a cycle. The id string is checked against the generated route tree, so a
 * typo here is a type error rather than a runtime undefined.
 */
const route = getRouteApi('/')

/** One screen of cards. Smaller than a listing page: this is the LCP candidate and it competes with the map. */
const HOME_LIMIT = 12

/**
 * The country's geographic centre, at a zoom that frames most of it.
 *
 * A fixed centre rather than the visitor's geolocation: asking for location permission on first paint is
 * a prompt before any value has been offered, and most people refuse it. The map queries whatever
 * viewport it ends up in, so panning is the interaction that narrows it.
 */
const CENTER: readonly [number, number] = [-98.5795, 39.8283]
const ZOOM = 5

const loader = async ({ context }: { context: RouterContext }) => {
	// Both queries at once. They are independent, and awaiting them in sequence would put the slower one's
	// latency on top of the faster one's for no reason — on a cold SSR request that is the visible delay.
	const [companies, categories] = await Promise.all([
		runQuery(context.gql, CompaniesDocument, { limit: HOME_LIMIT, offset: 0 }),
		runQuery(context.gql, ItemCategoriesDocument, {})
	])

	return { companies: companies.companies, categories: categories.itemCategories }
}

type LoaderData = Awaited<ReturnType<typeof loader>>

const head = ({ loaderData }: { loaderData?: LoaderData }) => {
	const nodes = loaderData?.companies.nodes ?? []

	return {
		...headFor({
			title: SITE_NAME,
			description: 'Browse shops near you and everything they offer, on one map.',
			path: '/'
		}),
		scripts: jsonLdScripts(websiteJsonLd(), itemListJsonLd(nodes.map((company) => `/shop/${company.slug}`)))
	}
}

const Home = () => {
	const { companies, categories } = route.useLoaderData()
	const tree = nestCategories(categories)

	// `flatMap` and not `filter().map()`: the filter narrows nothing for the type checker, so the map
	// afterwards would need a non-null assertion on a value the filter already proved.
	const pins = companies.nodes.flatMap((company) => {
		const position = company.address.position

		return position === null || position === undefined
			? []
			: [{ _id: company._id, publicName: company.publicName, slug: company.slug, coordinates: position.coordinates }]
	})

	return (
		<div className="mx-auto max-w-6xl px-4 py-8">
			<h1 className="text-3xl font-semibold text-palette-bg">Shops near you</h1>
			<p className="mt-2 text-slate-600">Find a shop on the map, or browse the list below.</p>

			<div className="mt-6">
				<MapIsland center={CENTER} zoom={ZOOM} initialPins={pins} />
			</div>

			<div className="mt-8 grid gap-8 md:grid-cols-[220px_1fr]">
				<aside>
					<CategoryNav categories={tree} />
				</aside>

				<section aria-label="Shops">
					{companies.nodes.length === 0 ? (
						<EmptyState title="No shops are published yet" hint="Come back soon." />
					) : (
						<>
							<ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
								{companies.nodes.map((company) => (
									<li key={company._id}>
										<ShopCard company={company} />
									</li>
								))}
							</ul>
							{companies.hasMore && (
								<Link to="/shops" className="mt-6 inline-block rounded-box bg-palette-bg px-4 py-2 text-sm text-palette-white">
									See all shops
								</Link>
							)}
						</>
					)}
				</section>
			</div>
		</div>
	)
}

export const homeRouteOptions = { loader, head, component: Home }
