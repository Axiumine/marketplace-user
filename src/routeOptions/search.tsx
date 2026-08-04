import { getRouteApi } from '@tanstack/react-router'
import { z } from 'zod'

import { SearchDocument } from '@/api/operations/publicResource/queries'
import { runQuery } from '@/api/run'
import { SearchBox } from '@/components/layout/SearchBox'
import { EmptyState } from '@/features/catalogue/EmptyState'
import { ItemGrid } from '@/features/catalogue/ItemGrid'
import { ShopGrid } from '@/features/catalogue/ShopGrid'
import { headFor } from '@/lib/seo'
import type { RouterContext } from '@/router'

/**
 * `/search?q=` — text search over shops and items, optionally within a radius.
 *
 * ⚠️ **Every search page is `noindex`, and that is not a mistake to fix.** A search-results URL is
 * generated content with no page of its own behind it: indexed, it fills a site's index with thin
 * near-duplicates that compete with the listing and category pages actually meant to rank, and anyone
 * can mint an unlimited number of them by varying `q`. The results themselves are still real `<a href>`s
 * and still server-rendered — a crawler that lands here follows them out. `noindex` says "do not keep
 * this page", not "do not read it".
 *
 * It is server-rendered anyway, rather than made client-only, because the first result set arriving
 * with the HTML is what makes the page feel instant on a phone, and because a shared search link has to
 * open to results rather than to a spinner.
 */
const route = getRouteApi('/search')

/** One screen of each kind. The resolver caps its own work; this is what the page is willing to render. */
const SEARCH_LIMIT = 24

/** 100 km. Past this a radius search stops being "near me" and starts being a scan with extra steps. */
const MAX_RADIUS_METERS = 100_000

/**
 * `near` is three numbers in one parameter, `lng,lat,radius`, rather than three parameters.
 *
 * One parameter is atomic: a link cannot carry two thirds of a location. The radius is in metres, the
 * coordinates in GeoJSON order — the same order the API speaks, so nothing is swapped anywhere between
 * the URL and the query.
 *
 * ⚠️ **The middle step is a `z.tuple`, not a `.refine` on an array, and that is a typing requirement
 * rather than a validation one.** `.split(',')` gives `string[]`; a `.refine` that checks `length === 3`
 * narrows nothing, so under `noUncheckedIndexedAccess` the destructure `[lng, lat, radiusMeters]` yields
 * three `number | undefined` and the object no longer matches `GraphQLInputNearPoint`, whose three
 * fields are `Float!`. A tuple schema carries the length in its output type, so the same destructure
 * yields three plain `string`s. It also rejects a fourth element, which the length check did too but
 * only at runtime.
 *
 * ⚠️ **The tuple holds `z.string()`, not `z.coerce.number()`, and the swap is not cosmetic.** A coerced
 * number accepts `unknown` as its *input*, so a tuple of three of them has input type
 * `[unknown, unknown, unknown]` — which `.pipe()` refuses to accept from a `string[]` producer with
 * `TS2345: … Type '[unknown, unknown, unknown]' is not assignable to type 'string[]'`. The parse to
 * numbers therefore happens in the transform, and the *ranges* below are what reject the garbage:
 * `Number('abc')` is `NaN`, which `z.number()` rejects outright in Zod 4, and `Number('')` is `0`, which
 * is a real coordinate but not a real radius. A URL that fails any of it is dropped by `.catch(undefined)`
 * and the page renders a plain text search instead of erroring on something somebody mistyped.
 */
const nearSchema = z
	.string()
	.transform((raw) => raw.split(','))
	.pipe(z.tuple([z.string(), z.string(), z.string()]))
	.transform(([lng, lat, radiusMeters]) => ({
		lng: Number(lng),
		lat: Number(lat),
		radiusMeters: Number(radiusMeters)
	}))
	.pipe(
		z.object({
			lng: z.number().min(-180).max(180),
			lat: z.number().min(-90).max(90),
			// Capped rather than merely positive: an unbounded radius is a query over the whole collection
			// dressed up as a geo search, and it is reachable by anyone who can edit a URL.
			radiusMeters: z.number().positive().max(MAX_RADIUS_METERS)
		})
	)

const searchSchema = z.object({
	q: z.string().catch(''),
	near: nearSchema.optional().catch(undefined)
})

export type SearchSearch = z.infer<typeof searchSchema>

const loader = async ({ context, deps }: { context: RouterContext; deps: SearchSearch }) => {
	const q = deps.q.trim()

	// An empty query is not a request worth making. The page renders the search box and says so, and the
	// backend never sees a text search for the empty string — which on a text index is a full scan.
	if (q === '') return { q, companies: [], items: [] }

	const data = await runQuery(context.gql, SearchDocument, {
		q,
		near: deps.near,
		limit: SEARCH_LIMIT
	})

	return { q, companies: data.search.companies, items: data.search.items }
}

type LoaderData = Awaited<ReturnType<typeof loader>>

const head = ({ loaderData }: { loaderData?: LoaderData }) => {
	const q = loaderData?.q ?? ''

	return headFor({
		title: q === '' ? 'Search' : `Search — ${q}`,
		description: 'Search shops and items across the platform.',
		// The canonical is the bare `/search`, so the thousands of `?q=` variations collapse into one URL
		// even for a crawler that ignores `noindex`.
		path: '/search',
		noIndex: true
	})
}

const Search = () => {
	const { q, companies, items } = route.useLoaderData()
	const nothing = companies.length === 0 && items.length === 0

	return (
		<div className="mx-auto max-w-6xl px-4 py-8">
			<h1 className="text-3xl font-semibold text-palette-bg">Search</h1>

			<div className="mt-4 max-w-xl">
				<SearchBox initialQuery={q} />
			</div>

			{q === '' ? (
				<div className="mt-8">
					<EmptyState title="Type something to search" hint="Shop names, item names and descriptions." />
				</div>
			) : nothing ? (
				<div className="mt-8">
					<EmptyState title={`Nothing found for “${q}”`} hint="Try fewer words, or a different spelling." />
				</div>
			) : (
				<>
					{companies.length > 0 && (
						<section aria-label="Shops" className="mt-8">
							<h2 className="text-xl font-semibold text-palette-bg">Shops</h2>
							<div className="mt-4">
								<ShopGrid companies={companies} />
							</div>
						</section>
					)}

					{items.length > 0 && (
						<section aria-label="Items" className="mt-8">
							<h2 className="text-xl font-semibold text-palette-bg">Items</h2>
							<div className="mt-4">
								<ItemGrid items={items} />
							</div>
						</section>
					)}
				</>
			)}
		</div>
	)
}

export const searchRouteOptions = {
	validateSearch: searchSchema,
	loaderDeps: ({ search }: { search: SearchSearch }) => search,
	loader,
	head,
	component: Search
}
