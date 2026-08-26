import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { searchRouteOptions } from '@/routeOptions/search'

import { companyOf, itemOf, searchCompaniesReply, searchItemsReply } from '../helpers/catalogue'
import type { GraphQLReplies } from '../helpers/graphql'
import { stubGraphQL } from '../helpers/graphql'
import type { RouteHead } from '../helpers/head'
import { canonicalOf, metaOf, titleOf } from '../helpers/head'
import { renderRoute } from '../helpers/render'

const OTHER_ITEM = itemOf({ _id: '66b0000000000000000000e2', name: 'Canvas tote', slug: 'canvas-tote' })

const DEFAULT_REPLIES: GraphQLReplies = {
	SearchCompanies: searchCompaniesReply([companyOf()]),
	SearchItems: searchItemsReply([itemOf(), OTHER_ITEM])
}

const mount = async (path: string, replies: GraphQLReplies = DEFAULT_REPLIES) => {
	const stub = stubGraphQL(replies)
	const result = await renderRoute(path)

	return { ...result, stub }
}

const head = (over?: { q: string; kind?: 'items' | 'companies'; page?: number }): RouteHead =>
	searchRouteOptions.head(
		(over === undefined ? {} : { loaderData: { q: over.q, kind: over.kind ?? 'items', page: over.page ?? 1 } }) as Parameters<
			typeof searchRouteOptions.head
		>[0]
	) as RouteHead

const parse = (search: Record<string, unknown>) => searchRouteOptions.validateSearch.parse(search)

const EMPTY_PAGE = { nodes: [], total: 0, totalIsExact: true, hasMore: false }

describe('the search route', () => {
	/*
	 * ⚠️ One kind per request, and the *other* document is never sent. The two are separate text-index
	 * scans over separate collections with separate counts; asking for both to render one of them doubles
	 * the cost of a page anyone can load as often as they can type.
	 */
	it('searches items by default, and asks nothing about shops', async () => {
		const { stub } = await mount('/search?q=satchel')

		expect(stub.calls).toHaveLength(1)
		expect(stub.calls[0]?.operationName).toBe('SearchItems')
		expect(stub.calls[0]?.variables).toEqual({ q: 'satchel', near: undefined, limit: 24, offset: 0 })
	})

	it('searches shops when the URL says so, and asks nothing about items', async () => {
		const { stub } = await mount('/search?q=rivers&kind=companies')

		expect(stub.calls).toHaveLength(1)
		expect(stub.calls[0]?.operationName).toBe('SearchCompanies')
		expect(stub.calls[0]?.variables).toEqual({ q: 'rivers', near: undefined, limit: 24, offset: 0 })
	})

	// A kind that is not one of the two is the default, not an error — same reason `?page=abc` is page 1.
	it('falls back to items when the URL names a kind that does not exist', async () => {
		const { stub } = await mount('/search?q=satchel&kind=shops')

		expect(stub.calls[0]?.operationName).toBe('SearchItems')
	})

	it('offsets the query by the page in the URL', async () => {
		const { stub } = await mount('/search?q=satchel&page=3')

		expect(stub.calls[0]?.variables).toMatchObject({ limit: 24, offset: 48 })
	})

	/*
	 * ⚠️ An empty query never reaches the backend. A text search for the empty string is a full collection
	 * scan on a text index, and it is one keystroke away on a page anyone can load.
	 */
	it('asks the backend nothing when there is nothing to search for', async () => {
		const { stub } = await mount('/search?q=%20%20')

		expect(stub.calls).toEqual([])
		expect(screen.getByText('Type something to search')).toBeInTheDocument()
	})

	/*
	 * ⚠️ The loader is called directly, because the two empty pages it returns for an empty query are
	 * invisible through the page: the component branches on `q === ''` first and renders the prompt without
	 * ever reading them. Anything at all could be in there — the request the page then makes with it is the
	 * one nobody wrote a screen for.
	 *
	 * `context` is never touched on this path (that is the point of the branch), so there is nothing to
	 * stub.
	 */
	it('answers an empty result set for an empty query, without touching the context', async () => {
		const result = await searchRouteOptions.loader({
			context: undefined as never,
			deps: { q: '   ', kind: 'items', page: 1 }
		})

		expect(result).toEqual({ q: '', kind: 'items', page: 1, near: undefined, companies: EMPTY_PAGE, items: EMPTY_PAGE })
	})

	it('trims the query before sending it', async () => {
		const { stub } = await mount('/search?q=%20satchel%20')

		expect(stub.calls[0]?.variables).toMatchObject({ q: 'satchel' })
	})

	it.each([
		['/search?q=rivers&kind=companies', 'Shops', /Rivers Boutique/, '/shop/rivers-boutique'],
		['/search?q=satchel', 'Items', /Leather satchel/, '/shop/rivers-boutique/item/leather-satchel']
	])('renders the %s results as real links', async (path, region, name, href) => {
		await mount(path)

		expect(within(screen.getByRole('region', { name: region })).getByRole('link', { name })).toHaveAttribute('href', href)
	})

	it('says how many it found', async () => {
		await mount('/search?q=rivers&kind=companies', {
			...DEFAULT_REPLIES,
			SearchCompanies: searchCompaniesReply([companyOf()], { total: 2 })
		})

		expect(screen.getByText(/found/).textContent).toBe('2 shops found.')
	})

	/*
	 * ⚠️ A total the resolver could not verify is rendered with a `+`, and on the items tab that is *every*
	 * total: the count runs on `item` alone, where it can see neither the shop's publication state nor the
	 * radius. It always overstates there, and `300` presented as exact is a number the listing contradicts
	 * as soon as somebody pages to the end.
	 */
	it('marks a total the resolver could not verify', async () => {
		await mount('/search?q=satchel', { ...DEFAULT_REPLIES, SearchItems: searchItemsReply([itemOf()], { total: 300 }) })

		expect(screen.getByText(/found/).textContent).toBe('300+ items found.')
	})

	it('says so when a real query matched nothing', async () => {
		await mount('/search?q=zzz', { ...DEFAULT_REPLIES, SearchItems: searchItemsReply([]) })

		expect(screen.getByText('Nothing found for “zzz”')).toBeInTheDocument()
		expect(screen.queryByRole('region', { name: 'Items' })).not.toBeInTheDocument()
	})

	// Scoped to the page's own box: the header carries a second one, and that one stays empty — it is the
	// same component, and seeding it here is what makes the query editable rather than retypeable.
	it('keeps the query in the box, so it can be edited rather than retyped', async () => {
		await mount('/search?q=satchel')

		expect(within(screen.getByRole('main')).getByRole('searchbox')).toHaveValue('satchel')
	})

	/*
	 * ⚠️ The page's own box carries the kind forward, as a hidden field, and only when it is not the
	 * default. Without it a visitor who retypes a query from the shops tab is silently thrown back onto
	 * items; with it emitted unconditionally, the default tab gets a second address.
	 */
	it('carries the chosen kind into the next search, and only when it is not the default', async () => {
		await mount('/search?q=rivers&kind=companies')

		const form = within(screen.getByRole('main')).getByRole('search')

		expect(form.querySelector('input[name="kind"]')).toHaveAttribute('value', 'companies')
	})

	it('leaves the default kind out of the box', async () => {
		await mount('/search?q=satchel')

		expect(within(screen.getByRole('main')).getByRole('search').querySelector('input[name="kind"]')).toBeNull()
	})
})

/*
 * ⚠️ The tabs are plain `<a href>`, like the pagination: switching kind is a whole new result set from a
 * different collection, and the anchor works before any JavaScript has loaded.
 */
describe('the search kind tabs', () => {
	it('links to the other kind and marks the one being shown', async () => {
		await mount('/search?q=satchel')

		const tabs = within(screen.getByRole('navigation', { name: 'What to search' }))

		expect(tabs.getByRole('link', { name: 'Items' })).toHaveAttribute('aria-current', 'page')
		expect(tabs.getByRole('link', { name: 'Shops' })).toHaveAttribute('href', '/search?q=satchel&kind=companies')
	})

	// The default kind is absent from the URL it links to: `/search?q=x` and `/search?q=x&kind=items` are
	// the same page, and minting both is how one search ends up linked and shared under two addresses.
	it('drops the kind from the link back to the default', async () => {
		await mount('/search?q=satchel&kind=companies')

		const tabs = within(screen.getByRole('navigation', { name: 'What to search' }))

		expect(tabs.getByRole('link', { name: 'Items' })).toHaveAttribute('href', '/search?q=satchel')
		expect(tabs.getByRole('link', { name: 'Shops' })).toHaveAttribute('aria-current', 'page')
	})

	// The page number is not carried across: page 4 of the items is not page 4 of anything on the shops
	// tab, and landing on an empty page after switching reads as "no shops matched".
	it('sends the visitor back to page 1 of the other kind', async () => {
		await mount('/search?q=satchel&page=3')

		expect(
			within(screen.getByRole('navigation', { name: 'What to search' })).getByRole('link', { name: 'Shops' })
		).toHaveAttribute('href', '/search?q=satchel&kind=companies')
	})

	// A location is part of what is being searched, so it survives the switch — the other tab is the same
	// search asked of the other collection.
	it('keeps the location across the switch', async () => {
		await mount('/search?q=bags&near=-71.06%2C42.36%2C5000')

		expect(
			within(screen.getByRole('navigation', { name: 'What to search' })).getByRole('link', { name: 'Shops' })
		).toHaveAttribute('href', '/search?q=bags&kind=companies&near=-71.06%2C42.36%2C5000')
	})

	it('renders no tabs at all before there is a query', async () => {
		await mount('/search?q=')

		expect(screen.queryByRole('navigation', { name: 'What to search' })).not.toBeInTheDocument()
	})
})

/*
 * ⚠️ Real anchors carrying `&page=`, never a "load more" button — and `&`, not `?`, because the base path
 * already carries the query. A second `?` would make the page number part of the value of `kind`, which
 * parses as an unknown kind, falls back to the default, and lands every "next" on page 1 of the wrong tab.
 */
describe('the search pagination', () => {
	it('paginates within the kind being searched', async () => {
		await mount('/search?q=satchel&kind=companies&page=2', {
			...DEFAULT_REPLIES,
			SearchCompanies: searchCompaniesReply([companyOf()], { hasMore: true })
		})

		expect(screen.getByRole('link', { name: '← Previous' })).toHaveAttribute('href', '/search?q=satchel&kind=companies')
		expect(screen.getByRole('link', { name: 'Next →' })).toHaveAttribute('href', '/search?q=satchel&kind=companies&page=3')
	})

	it('paginates the default kind without naming it', async () => {
		await mount('/search?q=satchel&page=2', {
			...DEFAULT_REPLIES,
			SearchItems: searchItemsReply([itemOf()], { hasMore: true })
		})

		expect(screen.getByRole('link', { name: '← Previous' })).toHaveAttribute('href', '/search?q=satchel')
		expect(screen.getByRole('link', { name: 'Next →' })).toHaveAttribute('href', '/search?q=satchel&page=3')
	})

	// `hasMore` comes from the resolver, never from `total`, which is capped: derived from a capped total
	// the listing would end at whatever the cap happens to be.
	it('offers no next page when the resolver says there is none', async () => {
		await mount('/search?q=satchel', { ...DEFAULT_REPLIES, SearchItems: searchItemsReply([itemOf()], { hasMore: false }) })

		expect(screen.queryByRole('link', { name: 'Next →' })).not.toBeInTheDocument()
	})
})

/*
 * ⚠️ `near` is three numbers in one parameter, `lng,lat,radius`, in GeoJSON order — the same order the API
 * speaks, so nothing is swapped anywhere between the URL and the query. One parameter is atomic: a link
 * cannot carry two thirds of a location.
 */
describe('the search parameters', () => {
	it('reads a location out of one parameter', async () => {
		const { stub } = await mount('/search?q=bags&near=-71.06%2C42.36%2C5000')

		expect(stub.calls[0]?.variables).toEqual({
			q: 'bags',
			near: { lng: -71.06, lat: 42.36, radiusMeters: 5000 },
			limit: 24,
			offset: 0
		})
	})

	/*
	 * ⚠️ The parameter stays a *string* through `validateSearch`, and the point is built in `loaderDeps`.
	 * The router re-stringifies the validated search back into the URL and writes an object as JSON, so a
	 * schema that parsed `near` into a point here would have the router rewrite the URL to `near={"lng":…}`
	 * — which is no longer a string, fails the next parse, and is dropped. Measured before the split: the
	 * location survived the first load and vanished one render later, taking the radius off the results
	 * while the URL still looked like it carried one.
	 */
	it('leaves the location unparsed in the URL, so it survives being written back', () => {
		expect(parse({ q: 'bags', near: '-71.06,42.36,5000' }).near).toBe('-71.06,42.36,5000')
	})

	/*
	 * ⚠️ A malformed `near` is dropped, not an error. These URLs are shared, truncated by chat clients and
	 * rewritten by every link shortener on the internet — a 500 on a mistyped coordinate answers a crawler's
	 * request with a server error, where a plain text search answers with results.
	 */
	it.each([
		['nothing at all', undefined],
		['two of the three numbers', '-71.06,42.36'],
		['a fourth number', '-71.06,42.36,5000,7'],
		['a longitude off the globe', '181,42.36,5000'],
		['a latitude off the globe', '-71.06,91,5000'],
		['words instead of numbers', 'here,there,near'],
		['a radius of nothing', '-71.06,42.36,0'],
		// Capped rather than merely positive: an unbounded radius is a scan over the whole collection dressed
		// up as a geo search, and it is reachable by anyone who can edit a URL.
		['a radius past 100 km', '-71.06,42.36,100001']
	])('drops a location carrying %s', (_label, near) => {
		expect(searchRouteOptions.loaderDeps({ search: { q: 'bags', near } }).near).toBeUndefined()
	})

	it('accepts the radius exactly at the cap', () => {
		expect(searchRouteOptions.loaderDeps({ search: { q: 'bags', near: '-71.06,42.36,100000' } }).near?.radiusMeters).toBe(
			100_000
		)
	})

	// `q` is `.catch('')` for the same reason: a missing or non-string `q` renders the search box, never an
	// error boundary.
	it.each([[{}], [{ q: 42 }]])('reads a missing or unusable q as an empty search: %j', (search) => {
		expect(parse(search).q).toBe('')
	})

	it.each([
		['abc', 1],
		['-3', 1],
		['0', 1],
		['2.7', 1],
		['4', 4]
	])('reads ?page=%s as page %i', (raw, expected) => {
		expect(parse({ q: 'bags', page: raw }).page).toBe(expected)
	})

	it.each([
		['shops', 'items'],
		['', 'items'],
		['companies', 'companies'],
		['items', 'items']
	])('reads ?kind=%s as %s', (raw, expected) => {
		expect(parse({ q: 'bags', kind: raw }).kind).toBe(expected)
	})

	/*
	 * ⚠️ Optional on the *output* type, and that is what both are for. TanStack derives whether `search` is
	 * a required prop from it: non-optional `kind` and `page` would force every `<Link to="/search">` in the
	 * app to pass both, and emit `/search?q=x&kind=items&page=1` — three URLs for one page.
	 */
	it('leaves the parameters absent when the URL carries none', () => {
		const parsed = parse({ q: 'bags' })

		expect(parsed.kind).toBeUndefined()
		expect(parsed.page).toBeUndefined()
	})

	// Normalised in `loaderDeps` and not in the loader, so an absent parameter and its explicit default
	// produce one cache key rather than two for the same page.
	it('normalises the absent parameters before the loader is keyed', () => {
		expect(searchRouteOptions.loaderDeps({ search: { q: 'bags' } })).toEqual({
			q: 'bags',
			kind: 'items',
			page: 1,
			near: undefined
		})
		expect(searchRouteOptions.loaderDeps({ search: { q: 'bags', kind: 'items', page: 1 } })).toEqual({
			q: 'bags',
			kind: 'items',
			page: 1,
			near: undefined
		})
	})

	it('keys the loader on the location too, so a new one refetches', () => {
		expect(
			searchRouteOptions.loaderDeps({ search: { q: 'bags', kind: 'companies', page: 5, near: '-71.06,42.36,5000' } })
		).toEqual({
			q: 'bags',
			kind: 'companies',
			page: 5,
			near: { lng: -71.06, lat: 42.36, radiusMeters: 5000 }
		})
	})
})

describe('the search route head', () => {
	it('names the query and the kind in the title, once there is one', () => {
		expect(titleOf(head({ q: '' }))).toBe('Search · Marketplace')
		expect(titleOf(head({ q: 'satchel' }))).toBe('Search — satchel · Items · Marketplace')
		expect(titleOf(head({ q: 'satchel', kind: 'companies' }))).toBe('Search — satchel · Shops · Marketplace')
		expect(titleOf(head())).toBe('Search · Marketplace')
	})

	// A shared link opens on a page as readily as on page 1, and a tab that says "Search — satchel" on page
	// 4 is a title describing a different page.
	it('names the page number past the first', () => {
		expect(titleOf(head({ q: 'satchel', page: 4 }))).toBe('Search — satchel · Items — page 4 · Marketplace')
	})

	/*
	 * ⚠️ Every search page is `noindex`, and the canonical is the bare `/search`. A results URL is generated
	 * content with no page behind it: indexed, it fills the site's index with thin near-duplicates that
	 * compete with the listing and category pages meant to rank, and anyone can mint an unlimited number of
	 * them by varying `q`. The results are still real `<a href>`s — `noindex` says "do not keep this page",
	 * not "do not read it".
	 */
	it('keeps every variation of the query out of the index, and collapses them into one URL', () => {
		expect(metaOf(head({ q: 'satchel' }), 'robots')).toBe('noindex, follow')
		expect(metaOf(head({ q: 'satchel', kind: 'companies', page: 3 }), 'robots')).toBe('noindex, follow')
		expect(canonicalOf(head({ q: 'satchel' }))).toBe('http://127.0.0.1:3045/search')
		expect(canonicalOf(head({ q: 'satchel', kind: 'companies', page: 3 }))).toBe('http://127.0.0.1:3045/search')
	})

	// The description does not name the query, deliberately: it is the same page whatever was typed, and it
	// is the description a link preview shows when the URL is shared into a chat.
	it('describes the page rather than the query', () => {
		expect(metaOf(head({ q: 'satchel' }), 'description')).toBe('Search shops and items across the platform.')
		expect(metaOf(head({ q: '' }), 'description')).toBe('Search shops and items across the platform.')
	})
})
