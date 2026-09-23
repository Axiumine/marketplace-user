import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { shopRouteOptions } from '@/routeOptions/shop'

import type { FixtureCompany } from '../helpers/catalogue'
import { companyOf, itemOf, itemsReply } from '../helpers/catalogue'
import type { GraphQLReplies, GraphQLReply } from '../helpers/graphql'
import { stubGraphQL } from '../helpers/graphql'
import type { RouteHead } from '../helpers/head'
import { canonicalOf, jsonLdTyped, linkOf, metaOf, titleOf } from '../helpers/head'
import { renderRoute } from '../helpers/render'

/* The island is stubbed for the same reason as on the home page. What this page owes the map is one pin
 * on the shop itself, and the stub renders it. */
vi.mock('@/features/map/MapIsland', async () => (await import('../helpers/mapIsland')).mapIslandStub())

const shopReply = (company: FixtureCompany | null): GraphQLReply => ({ data: { companyBySlug: company } })

const replies = (company: FixtureCompany | null, items: GraphQLReply): GraphQLReplies => ({
	CompanyBySlug: shopReply(company),
	Items: items
})

const mount = async (
	path = '/shop/rivers-boutique',
	company: FixtureCompany | null = companyOf(),
	items = itemsReply([itemOf()])
) => {
	const stub = stubGraphQL(replies(company, items))
	const result = await renderRoute(path)

	return { ...result, stub }
}

const head = (company: FixtureCompany | null, page = 1, itemSlugs: readonly string[] = [], hasMore = false): RouteHead =>
	shopRouteOptions.head({
		loaderData:
			company === null
				? undefined
				: {
						company,
						items: {
							nodes: itemSlugs.map((slug) => ({ slug })),
							total: itemSlugs.length,
							totalIsExact: true,
							hasMore
						},
						page
					}
	} as Parameters<typeof shopRouteOptions.head>[0]) as RouteHead

describe('the shop route', () => {
	/*
	 * ⚠️ Sequential, not `Promise.all`. The item query is pointless when the shop does not exist, and a 404
	 * is a URL a crawler can request as often as it likes — firing both would spend an index walk on every
	 * one of them.
	 */
	it('asks for the shop first and its items second', async () => {
		const { stub } = await mount()

		expect(stub.calls.map((call) => call.operationName)).toEqual(['CompanyBySlug', 'Items'])
		expect(stub.calls[0]?.variables).toEqual({ slug: 'rivers-boutique' })
		expect(stub.calls[1]?.variables).toEqual({ companySlug: 'rivers-boutique', limit: 24, offset: 0 })
	})

	it('offsets the item query by the page in the URL', async () => {
		const { stub } = await mount('/shop/rivers-boutique?page=3')

		expect(stub.calls[1]?.variables).toEqual({ companySlug: 'rivers-boutique', limit: 24, offset: 48 })
	})

	/*
	 * ⚠️ A missing shop is a real 404, not an empty page. The resolver answers `null` for an unknown *or
	 * unpublished* slug, so an owner who unpublishes leaves a URL that is already indexed — a soft 200 keeps
	 * it in the index, pointing at nothing.
	 */
	it('404s a slug the resolver does not know', async () => {
		const { stub } = await mount('/shop/nowhere', null)

		expect(screen.getByRole('heading', { level: 1, name: 'This page does not exist' })).toBeInTheDocument()
		expect(stub.calls.map((call) => call.operationName)).toEqual(['CompanyBySlug'])
	})

	/*
	 * ⚠️ The same 404, reached through the other shape a missing shop arrives in. `runQuery` hands back
	 * whatever the envelope carried, so a reply with no `companyBySlug` key at all lands in the loader as
	 * `undefined` rather than as `null`. A guard that tests only one of the two renders the shop page with
	 * no shop in it — a heading built from `undefined.publicName`, which throws inside the render rather
	 * than 404ing the URL.
	 */
	it('404s an answer that carries no shop at all', async () => {
		stubGraphQL({ CompanyBySlug: { data: {} } })
		await renderRoute('/shop/nowhere')

		expect(screen.getByRole('heading', { level: 1, name: 'This page does not exist' })).toBeInTheDocument()
	})

	/*
	 * ⚠️ The page is read straight out of the URL, and every spelling a visitor or a crawler can produce has
	 * to land on a real page number. `?page=abc` reaching the resolver as `NaN` answers a crawler's request
	 * for a listing with a 500, which is a far worse signal than the page it asked for not existing.
	 */
	it.each([
		['abc', 1],
		['-3', 1],
		['0', 1],
		['2.7', 1],
		['4', 4]
	])('reads ?page=%s as page %i', (raw, expected) => {
		expect(shopRouteOptions.validateSearch.parse({ page: raw }).page).toBe(expected)
	})

	/*
	 * ⚠️ Optional on the *output* type. TanStack derives whether `search` is a required prop from it, so a
	 * non-optional `page` would force every `<Link to="/shop/$slug">` in the app to pass `search={{ page: 1 }}`
	 * and emit `?page=1` — a second URL for page 1, competing in the index with the canonical this same file
	 * emits. `loaderDeps` normalises instead, so an absent `?page=` and an explicit `?page=1` key one entry.
	 */
	it('leaves the page absent when the URL carries none, and keys the loader at 1 anyway', () => {
		expect(shopRouteOptions.validateSearch.parse({}).page).toBeUndefined()
		expect(shopRouteOptions.loaderDeps({ search: {} })).toEqual({ page: 1 })
	})

	it('renders the shop, its address and its items', async () => {
		await mount()

		expect(screen.getByRole('heading', { level: 1, name: 'Rivers Boutique' })).toBeInTheDocument()
		// One `<address>` split over a `<br>`, so the two lines are read together rather than matched apart.
		expect(screen.getByText(/1 Main Street/).textContent).toBe('1 Main Street02108 Boston (MA)')
		expect(screen.getByText('Leather goods, made two streets away.')).toBeInTheDocument()
		expect(within(screen.getByRole('region', { name: 'Items' })).getByText('Leather satchel')).toBeInTheDocument()
	})

	it('counts the items beside their heading', async () => {
		await mount('/shop/rivers-boutique', companyOf(), itemsReply([itemOf()], { total: 7 }))

		expect(screen.getByRole('heading', { level: 2, name: /^Items/ }).textContent).toBe('Items (7)')
	})

	it('opens the map on the shop rather than on the country', async () => {
		await mount()

		expect(screen.getByTestId('map')).toHaveTextContent('-71.0589,42.3601 @ 15 · rivers-boutique')
	})

	// Both "no position at all" and "a position that is not a plottable pair" render the page without a map,
	// which is the right outcome for each — the alternative is a MapLibre centre of `NaN`.
	it.each([
		['no position', null],
		['a position with one coordinate', { type: 'Point', coordinates: [-71.0589] }]
	])('renders the page without a map when the shop has %s', async (_label, position) => {
		await mount('/shop/rivers-boutique', companyOf({ address: { ...companyOf().address, position } }))

		expect(screen.queryByTestId('map')).not.toBeInTheDocument()
		expect(screen.getByRole('heading', { level: 1, name: 'Rivers Boutique' })).toBeInTheDocument()
	})

	/*
	 * ⚠️ Absent, not present and empty. All three spellings the wire allows — `''`, `null`, an omitted key —
	 * have to collapse to the same thing, and "the text is not on screen" is true of an empty `<p>` too. The
	 * paragraph carries a top margin, so the one that renders anyway pushes the map down by a line for no
	 * reason a reader can see.
	 */
	it.each([
		['an empty description', ''],
		['a null description', null]
	])('omits the description paragraph given %s', async (_label, description) => {
		await mount('/shop/rivers-boutique', companyOf({ description }))

		expect(screen.queryByText('Leather goods, made two streets away.')).not.toBeInTheDocument()
		expect(document.querySelector('p.max-w-3xl')).toBeNull()
	})

	it('renders the description in its own paragraph when there is one', async () => {
		await mount()

		expect(document.querySelector('p.max-w-3xl')?.textContent).toBe('Leather goods, made two streets away.')
	})

	/*
	 * ⚠️ The trail in the page, asserted separately from the `BreadcrumbList` in the head, because the two are
	 * read by different audiences: this one is an `href` a visitor clicks, that one is a string a crawler
	 * parses, and they come from one array precisely so they cannot disagree.
	 */
	it('walks the visitor back up through Home and Shops', async () => {
		await mount()

		const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }))

		expect(trail.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
		expect(trail.getByRole('link', { name: 'Shops' })).toHaveAttribute('href', '/shops')
		// The last crumb is the current page, so it is text rather than a link — `getByText` covers both.
		expect(trail.getByText('Rivers Boutique')).toBeInTheDocument()
	})

	it('says so when the shop has published nothing', async () => {
		await mount('/shop/rivers-boutique', companyOf(), itemsReply([]))

		expect(screen.getByText('This shop has not published any item yet')).toBeInTheDocument()
	})

	it('paginates the items with links a crawler can follow', async () => {
		await mount('/shop/rivers-boutique?page=2', companyOf(), itemsReply([itemOf()], { hasMore: true }))

		expect(screen.getByRole('link', { name: '← Previous' })).toHaveAttribute('href', '/shop/rivers-boutique')
		expect(screen.getByRole('link', { name: 'Next →' })).toHaveAttribute('href', '/shop/rivers-boutique?page=3')
	})

	it('links each item to its own page', async () => {
		await mount()

		expect(screen.getByRole('link', { name: /Leather satchel/ })).toHaveAttribute(
			'href',
			'/shop/rivers-boutique/item/leather-satchel'
		)
	})
})

/*
 * ⚠️ `items(companySlug:)` throws once its offset passes `MAX_OFFSET` (10 000) in
 * `marketplace-dev-public-resource`'s `publicRead.mts`, rather than clamping. Page 417 is the deepest one
 * `offsetOf` still keeps at or under that cap (9 984); page 418 crosses it (10 008) and would crash the
 * SSR loader on the backend's raw throw if the frontend ever sent it.
 */
describe('the shop route past the backend’s offset cap', () => {
	it('404s a page beyond the cap without querying the shop or its items at all', async () => {
		const { stub } = await mount('/shop/rivers-boutique?page=418')

		expect(screen.getByRole('heading', { level: 1, name: 'This page does not exist' })).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	it('still serves the deepest page the cap allows', async () => {
		const { stub } = await mount('/shop/rivers-boutique?page=417')

		expect(stub.calls.map((call) => call.operationName)).toEqual(['CompanyBySlug', 'Items'])
		expect(stub.calls[1]?.variables).toEqual({ companySlug: 'rivers-boutique', limit: 24, offset: 9984 })
	})
})

describe('the shop route head', () => {
	it('titles the page with the trading name, and the page after the first', () => {
		expect(titleOf(head(companyOf()))).toBe('Rivers Boutique · Marketplace')
		expect(titleOf(head(companyOf(), 2))).toBe('Rivers Boutique — page 2 · Marketplace')
	})

	/*
	 * ⚠️ Page 1 is the page that must be indexed — it is the shop. The `noindex` starts at page 2, and a
	 * boundary read as `>=` would take the whole shop out of the index while every page of its item list
	 * stayed in. Nothing on the page looks different either way, which is why the absence is asserted rather
	 * than left implied by the page-2 case.
	 */
	it('indexes the shop itself and none of the pages after it', () => {
		expect(metaOf(head(companyOf()), 'robots')).toBeUndefined()
		expect(metaOf(head(companyOf(), 2), 'robots')).toBe('noindex, follow')
	})

	/*
	 * ⚠️ The address leads the description. That is the part of a snippet a person scans when the query was
	 * local, and it is the only line that answers "is this shop near me" before the click.
	 */
	it('opens the description with the address, then the shop’s own words', () => {
		expect(metaOf(head(companyOf()), 'description')).toBe('1 Main Street, 02108 Boston. Leather goods, made two streets away.')
	})

	it('describes a shop with no words of its own by where it is', () => {
		expect(metaOf(head(companyOf({ description: null })), 'description')).toBe('1 Main Street, 02108 Boston')
	})

	it('keeps the canonical on the page it describes', () => {
		expect(canonicalOf(head(companyOf()))).toBe('http://127.0.0.1:3045/shop/rivers-boutique')
		expect(canonicalOf(head(companyOf(), 2))).toBe('http://127.0.0.1:3045/shop/rivers-boutique?page=2')
	})

	it('chains the item pages together, absolutely', () => {
		const middle = head(companyOf(), 2, [], true)

		expect(linkOf(middle, 'prev')).toBe('http://127.0.0.1:3045/shop/rivers-boutique')
		expect(linkOf(middle, 'next')).toBe('http://127.0.0.1:3045/shop/rivers-boutique?page=3')
	})

	/*
	 * ⚠️ The whole `links` array, not a `linkOf` lookup, because the failure worth catching here is a `rel`
	 * that is *present* and should not be. A `prev` on page 1 points a crawler at a page before the first
	 * one, and a `next` on the last page advertises a page of nothing — both are links the site tells a
	 * crawler to follow, and neither shows up in any assertion that only asks what `prev` resolves to.
	 */
	it('advertises neither a previous nor a next page on a shop with one page of items', () => {
		expect(head(companyOf()).links).toEqual([{ rel: 'canonical', href: 'http://127.0.0.1:3045/shop/rivers-boutique' }])
	})

	/*
	 * ⚠️ This block is what the whole SSR argument is about: `Store` with a real `geo` is what can put a
	 * shop into a local-results panel, and a crawler that has to run JavaScript to find it usually does not.
	 * GeoJSON is `[lng, lat]` and schema.org names its fields — read in the wrong order this puts a
	 * shop in the Southern Ocean, and nothing on the page looks wrong.
	 */
	it('declares the shop as a Store, with its address and its coordinates', () => {
		const store = jsonLdTyped(head(companyOf()), 'Store')

		expect(store).toMatchObject({
			name: 'Rivers Boutique',
			url: 'http://127.0.0.1:3045/shop/rivers-boutique',
			description: 'Leather goods, made two streets away.',
			address: {
				'@type': 'PostalAddress',
				streetAddress: '1 Main Street',
				postalCode: '02108',
				addressLocality: 'Boston',
				addressRegion: 'MA',
				addressCountry: 'IT'
			},
			geo: { '@type': 'GeoCoordinates', longitude: -71.0589, latitude: 42.3601 }
		})
	})

	it('omits the geo block rather than guessing at a shop with no position', () => {
		const store = jsonLdTyped(head(companyOf({ address: { ...companyOf().address, position: null } })), 'Store')

		expect(store?.geo).toBeUndefined()
	})

	it('names the shop as the last crumb of the trail', () => {
		expect(jsonLdTyped(head(companyOf()), 'BreadcrumbList')?.itemListElement).toEqual([
			{ '@type': 'ListItem', position: 1, name: 'Home', item: 'http://127.0.0.1:3045/' },
			{ '@type': 'ListItem', position: 2, name: 'Shops', item: 'http://127.0.0.1:3045/shops' },
			{ '@type': 'ListItem', position: 3, name: 'Rivers Boutique', item: 'http://127.0.0.1:3045/shop/rivers-boutique' }
		])
	})

	it('lists the items on the page, numbered from where the page starts', () => {
		expect(jsonLdTyped(head(companyOf(), 2, ['leather-satchel']), 'ItemList')?.itemListElement).toEqual([
			{ '@type': 'ListItem', position: 25, url: 'http://127.0.0.1:3045/shop/rivers-boutique/item/leather-satchel' }
		])
	})

	/*
	 * ⚠️ No `Store` block at all before the loader answers, rather than a `Store` with an empty name. A
	 * placeholder here would be structured data describing a page that does not exist yet, which is the one
	 * mistake in this file that costs the whole domain its rich results rather than just this page.
	 */
	it('emits a bare head, and no structured data, before the loader answers', () => {
		const empty = head(null)

		expect(titleOf(empty)).toBe('Shop · Marketplace')
		expect(canonicalOf(empty)).toBe('http://127.0.0.1:3045/shops')
		expect(jsonLdTyped(empty, 'Store')).toBeUndefined()
		// Empty rather than a placeholder sentence: this head is only ever on screen for the instant before the
		// loader answers, and a description written here would be the one a crawler that gave up would keep.
		expect(metaOf(empty, 'description')).toBe('')
	})
})
