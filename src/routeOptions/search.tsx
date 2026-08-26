import { getRouteApi } from '@tanstack/react-router'
import { z } from 'zod'

import { SearchCompaniesDocument, SearchItemsDocument } from '@/api/operations/publicResource/queries'
import { runQuery } from '@/api/run'
import { SearchBox } from '@/components/layout/SearchBox'
import { EmptyState } from '@/features/catalogue/EmptyState'
import { ItemGrid } from '@/features/catalogue/ItemGrid'
import { Pagination } from '@/features/catalogue/Pagination'
import { ShopGrid } from '@/features/catalogue/ShopGrid'
import { formatTotal } from '@/lib/format'
import { offsetOf, PAGE_SIZE, pageLinks, pageNumber } from '@/lib/pagination'
import type { SearchKind } from '@/lib/search'
import { DEFAULT_SEARCH_KIND, SEARCH_KINDS } from '@/lib/search'
import { headFor } from '@/lib/seo'
import type { RouterContext } from '@/router'

/**
 * `/search?q=&kind=&page=&near=` — text search over shops *or* items, one kind at a time, paginated.
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
 *
 * ⚠️ **One kind per request, and the loader sends one document of the two.** The backend answers
 * `searchCompanies` and `searchItems` as separate paginated fields; asking for both to render one of
 * them would cost two text-index scans and two counts per keystroke-driven page load.
 */
const route = getRouteApi('/search')

/** 100 km. Past this a radius search stops being "near me" and starts being a scan with extra steps. */
const MAX_RADIUS_METERS = 100_000

/** What the tab bar calls each kind, and what the result count is measured in. */
const KIND_LABEL: Record<SearchKind, string> = { items: 'Items', companies: 'Shops' }

/**
 * One page of nothing, for the two cases that render no results: an empty query, and the kind the
 * visitor is *not* looking at.
 *
 * ⚠️ The inactive kind gets this rather than `undefined` on purpose. An optional page would put a `??`
 * fallback on every read of `total`, `hasMore` and `nodes` in the component below — four branches that
 * no reachable state exercises, which is a permanent hole in a coverage gate that breaks at 100. It is
 * never rendered: the component reads the active kind's page and nothing else.
 */
const EMPTY_PAGE = { nodes: [], total: 0, totalIsExact: true, hasMore: false }

/**
 * `near` is three numbers in one parameter, `lng,lat,radius`, rather than three parameters.
 *
 * One parameter is atomic: a link cannot carry two thirds of a location. The radius is in metres, the
 * coordinates in GeoJSON order — the same order the API speaks, so nothing is swapped anywhere between
 * the URL and the query. `searchPath` below writes this same format back out; the two are kept in one
 * file so the reader and the writer cannot drift.
 *
 * ⚠️ **It is *not* `validateSearch`'s `near`, and that is a round-trip requirement rather than a
 * preference.** The router re-stringifies the validated search back into the URL, and the default
 * stringifier writes an object as JSON — so a schema that turned `near=-71.06,42.36,5000` into an object
 * would have the router rewrite the URL to `near={"lng":…}`, whose next parse is not a string, fails this
 * schema, and is dropped by the `.catch` below. Measured: the location survived the first load and
 * vanished on the rewrite, one render later. The URL therefore carries the string, `loaderDeps` parses it
 * once, and the object exists only below the router.
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

/**
 * ⚠️ **`.optional()` on `kind` and `page` is load-bearing, and not for parsing.** It is what makes the
 * router's `search` prop optional on a `<Link to="/search">`: TanStack derives that requirement from the
 * *output* type, and `.catch(…)` alone produces a non-optional value, so every link into this route
 * would have to pass both and would then emit `/search?q=lamp&kind=items&page=1` — three URLs for one
 * page. Optional in, normalised at the one place that reads them (`loaderDeps` below). Every paginated
 * route here does the same.
 *
 * `?kind=shops` and `?page=abc` both fall back rather than throwing, for the reason `q` does: these URLs
 * are typed by hand, shared into chats and rewritten by every link shortener on the internet, and an
 * error boundary for a mistyped parameter is a 500 where the visitor expected results.
 */
const searchSchema = z.object({
	q: z.string().catch(''),
	kind: z.enum(SEARCH_KINDS).catch(DEFAULT_SEARCH_KIND).optional(),
	page: z.coerce.number().int().min(1).catch(1).optional(),
	// The unparsed `lng,lat,radius`, exactly as the URL spells it. `nearOf` below turns it into a point,
	// and a URL that is not one becomes no location at all rather than an error.
	near: z.string().optional().catch(undefined)
})

export type SearchSearch = z.infer<typeof searchSchema>

type Near = z.output<typeof nearSchema>

/** The one place the raw parameter becomes a point — a malformed one is dropped, never thrown. */
const nearOf = (raw: string | undefined): Near | undefined => {
	const parsed = nearSchema.safeParse(raw)

	return parsed.success ? parsed.data : undefined
}

interface ISearchDeps {
	q: string
	kind: SearchKind
	page: number
	near?: Near | undefined
}

/**
 * The address of one search, as a string.
 *
 * A string rather than a `<Link search={…}>` object because both callers need it as one: `pageLinks`
 * appends `&page=` to it, and the tab bar renders it as a plain `href` that works before any JavaScript
 * has loaded. It is also the only way to write `near` back out — the route's schema *parses* it from
 * `lng,lat,radius` into an object, so handing that object back to the router would serialise it as JSON
 * and the next parse would drop it.
 *
 * The default kind is omitted deliberately; see `DEFAULT_SEARCH_KIND` for why one page must not have
 * two addresses.
 */
const searchPath = (q: string, kind: SearchKind, near?: Near): string => {
	const params = new URLSearchParams({ q })

	if (kind !== DEFAULT_SEARCH_KIND) params.set('kind', kind)
	if (near !== undefined) params.set('near', `${String(near.lng)},${String(near.lat)},${String(near.radiusMeters)}`)

	return `/search?${params.toString()}`
}

const loader = async ({ context, deps }: { context: RouterContext; deps: ISearchDeps }) => {
	const q = deps.q.trim()
	const base = { q, kind: deps.kind, page: deps.page, near: deps.near }

	// An empty query is not a request worth making. The page renders the search box and says so, and the
	// backend never sees a text search for the empty string — which on a text index is a full scan.
	if (q === '') return { ...base, companies: EMPTY_PAGE, items: EMPTY_PAGE }

	const variables = { q, near: deps.near, limit: PAGE_SIZE, offset: offsetOf(deps.page) }

	if (deps.kind === 'companies') {
		const data = await runQuery(context.gql, SearchCompaniesDocument, variables)

		return { ...base, companies: data.searchCompanies, items: EMPTY_PAGE }
	}

	const data = await runQuery(context.gql, SearchItemsDocument, variables)

	return { ...base, companies: EMPTY_PAGE, items: data.searchItems }
}

type LoaderData = Awaited<ReturnType<typeof loader>>

const head = ({ loaderData }: { loaderData?: LoaderData }) => {
	const q = loaderData?.q ?? ''
	const page = loaderData?.page ?? 1
	const kind = loaderData?.kind ?? DEFAULT_SEARCH_KIND

	// The kind and the page are both in the title because a shared link opens on them, and a tab that
	// says "Search — lamp" on page 4 of the shops is a title that describes a different page.
	const named = q === '' ? 'Search' : `Search — ${q} · ${KIND_LABEL[kind]}`

	return headFor({
		title: page === 1 ? named : `${named} — page ${String(page)}`,
		description: 'Search shops and items across the platform.',
		// The canonical is the bare `/search`, so the thousands of `?q=` variations collapse into one URL
		// even for a crawler that ignores `noindex`.
		path: '/search',
		noIndex: true
	})
}

const Search = () => {
	const { q, kind, page, near, companies, items } = route.useLoaderData()

	// The active kind's page. The other one is `EMPTY_PAGE` and is never read.
	const found = kind === 'companies' ? companies : items
	const { prev, next } = pageLinks(searchPath(q, kind, near), page, found.hasMore)

	return (
		<div className="mx-auto max-w-6xl px-4 py-8">
			<h1 className="text-3xl font-semibold text-palette-bg">Search</h1>

			<div className="mt-4 max-w-xl">
				<SearchBox initialQuery={q} kind={kind} />
			</div>

			{q === '' ? (
				<div className="mt-8">
					<EmptyState title="Type something to search" hint="Shop names, item names and descriptions." />
				</div>
			) : (
				<>
					{/*
					 * Plain `<a href>`s, like `Pagination`: switching kind is a whole new result set from a
					 * different collection, and the anchor works with no JavaScript at all. `aria-current`
					 * is what tells a screen reader which of the two is being shown — the styling alone says
					 * it only to people who can see it.
					 */}
					<nav aria-label="What to search" className="mt-6 flex gap-2">
						{SEARCH_KINDS.map((candidate) => (
							<a
								key={candidate}
								href={searchPath(q, candidate, near)}
								aria-current={candidate === kind ? 'page' : undefined}
								className={
									candidate === kind
										? 'rounded-box bg-palette-bg px-4 py-2 text-sm font-medium text-palette-white'
										: 'rounded-box border border-slate-300 bg-white px-4 py-2 text-sm text-slate-600'
								}
							>
								{KIND_LABEL[candidate]}
							</a>
						))}
					</nav>

					{found.nodes.length === 0 ? (
						<div className="mt-8">
							<EmptyState title={`Nothing found for “${q}”`} hint="Try fewer words, a different spelling, or the other tab." />
						</div>
					) : (
						<section aria-label={KIND_LABEL[kind]} className="mt-8">
							{/*
							 * ⚠️ `totalIsExact` is always false on the items tab, and not because of the cap:
							 * the backend's count runs on `item` alone, where it can see neither the shop's
							 * publication state nor the radius. `formatTotal` renders that as "300+", which is
							 * the honest reading.
							 */}
							<p className="text-slate-600">
								{formatTotal(found.total, found.totalIsExact)} {KIND_LABEL[kind].toLowerCase()} found.
							</p>

							<div className="mt-4">
								{kind === 'companies' ? <ShopGrid companies={companies.nodes} /> : <ItemGrid items={items.nodes} />}
							</div>

							<Pagination prev={prev} next={next} page={page} />
						</section>
					)}
				</>
			)}
		</div>
	)
}

export const searchRouteOptions = {
	validateSearch: searchSchema,
	// Without this the loader never re-runs on a page or kind change: the router keys a loader's result
	// by its params, and neither `?page=` nor `?kind=` is one.
	//
	// Both are normalised here rather than in the loader, so an absent parameter and its explicit default
	// produce the *same* key — they are the same page, and keying them apart would fetch and cache it
	// twice.
	loaderDeps: ({ search }: { search: SearchSearch }): ISearchDeps => ({
		q: search.q,
		kind: search.kind ?? DEFAULT_SEARCH_KIND,
		page: pageNumber(search.page),
		near: nearOf(search.near)
	}),
	loader,
	head,
	component: Search
}
