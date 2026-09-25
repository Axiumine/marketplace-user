import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { shopsRouteOptions } from '@/routeOptions/shops'

import { companiesReply, companyOf } from '../helpers/catalogue'
import type { GraphQLReply } from '../helpers/graphql'
import { stubGraphQL } from '../helpers/graphql'
import type { RouteHead } from '../helpers/head'
import { canonicalOf, jsonLdTyped, linkOf, metaOf, titleOf } from '../helpers/head'
import { installOnlineListenerGuard } from '../helpers/onlineListenerGuard'
import { renderRoute } from '../helpers/render'

installOnlineListenerGuard()

const OTHER = companyOf({ _id: '66b0000000000000000000c2', publicName: 'Green Boutique', slug: 'green-boutique' })

const mount = async (path = '/shops', companies: GraphQLReply = companiesReply([companyOf(), OTHER])) => {
	const stub = stubGraphQL({ Companies: companies })
	const result = await renderRoute(path)

	return { ...result, stub }
}

const head = (page: number, slugs: readonly string[], hasMore = false): RouteHead =>
	shopsRouteOptions.head({
		loaderData: {
			companies: {
				nodes: slugs.map((slug) => ({ slug })),
				total: slugs.length,
				totalIsExact: true,
				hasMore
			},
			page
		}
	} as Parameters<typeof shopsRouteOptions.head>[0]) as RouteHead

describe('the shops route', () => {
	it('asks for one page of shops', async () => {
		const { stub } = await mount()

		expect(stub.calls[0]?.operationName).toBe('Companies')
		expect(stub.calls[0]?.variables).toEqual({ limit: 24, offset: 0 })
	})

	it('offsets the query by the page in the URL', async () => {
		const { stub } = await mount('/shops?page=3')

		expect(stub.calls[0]?.variables).toEqual({ limit: 24, offset: 48 })
	})

	it('renders the shops as a grid of links', async () => {
		await mount()

		expect(screen.getByRole('heading', { level: 1, name: 'All shops' })).toBeInTheDocument()
		expect(screen.getByRole('link', { name: /Rivers Boutique/ })).toHaveAttribute('href', '/shop/rivers-boutique')
	})

	it('says how many shops there are', async () => {
		await mount('/shops', companiesReply([companyOf()], { total: 2 }))

		expect(screen.getByText(/shops published/).textContent).toBe('2 shops published.')
	})

	/*
	 * ⚠️ A capped total is rendered with a `+`. `totalIsExact` is false when the resolver stopped counting,
	 * and then `total` is the cap rather than the answer — it always understates, so a customer told "500
	 * shops" where there are 40 000 concludes the site is empty.
	 *
	 * `12,500` and not `12500` because the locale is `en-GB`, which groups thousands with a comma from four
	 * digits up: 1000 formats as `1,000` and 12500 as `12,500`.
	 */
	it('marks a total the resolver stopped counting', async () => {
		await mount('/shops', companiesReply([companyOf()], { total: 12500, totalIsExact: false }))

		expect(screen.getByText(/shops published/).textContent).toBe('12,500+ shops published.')
	})

	it('says so when a page is past the end of the listing', async () => {
		await mount('/shops?page=9', companiesReply([]))

		expect(screen.getByText('No shops on this page')).toBeInTheDocument()
		expect(screen.getByText('Try the first page.')).toBeInTheDocument()
	})

	/*
	 * ⚠️ Real anchors with a `?page=` query, never a "load more" button. This page carries the catalogue's
	 * crawl budget — it is one hop from the home page and it is how a crawler reaches every shop detail
	 * page — and a crawler does not click.
	 */
	it('paginates with links a crawler can follow', async () => {
		await mount('/shops?page=2', companiesReply([companyOf()], { hasMore: true }))

		expect(screen.getByRole('link', { name: '← Previous' })).toHaveAttribute('href', '/shops')
		expect(screen.getByRole('link', { name: 'Next →' })).toHaveAttribute('href', '/shops?page=3')
	})

	/*
	 * ⚠️ The rendered trail and the `BreadcrumbList` below come from one array, so this is also what pins
	 * the crumb paths the structured data carries — one assertion, both audiences, and no way for the two
	 * to drift into telling a crawler one hierarchy and a visitor another.
	 */
	it('places the listing under home in the trail, whatever the page', async () => {
		await mount('/shops?page=2')

		const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }))

		expect(trail.getAllByRole('listitem')).toHaveLength(2)
		expect(trail.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
		expect(trail.getByText('Shops')).toHaveAttribute('aria-current', 'page')
	})
})

/*
 * ⚠️ `companies` throws once its offset passes `MAX_OFFSET` (10 000) in
 * `marketplace-dev-public-resource`'s `publicRead.mts`, rather than clamping. Page 417 is the deepest one
 * `offsetOf` still keeps at or under that cap (9 984); page 418 crosses it (10 008) and would crash the
 * SSR loader on the backend's raw throw if the frontend ever sent it.
 */
describe('the shops route past the backend’s offset cap', () => {
	it('404s a page beyond the cap without querying at all', async () => {
		const { stub } = await mount('/shops?page=418')

		expect(screen.getByRole('heading', { level: 1, name: 'This page does not exist' })).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	it('still serves the deepest page the cap allows', async () => {
		const { stub } = await mount('/shops?page=417')

		expect(stub.calls[0]?.variables).toEqual({ limit: 24, offset: 9984 })
	})
})

describe('the shops search parameter', () => {
	/*
	 * ⚠️ `?page=abc` lands on page 1 instead of throwing. These URLs are typed by hand, linked from
	 * elsewhere and rewritten by every share button on the internet — an error boundary here would answer a
	 * crawler's request for a listing with a 500.
	 */
	it.each([
		['abc', 1],
		['-3', 1],
		['0', 1],
		['2.7', 1],
		['4', 4]
	])('reads ?page=%s as page %i', (raw, expected) => {
		expect(shopsRouteOptions.validateSearch.parse({ page: raw }).page).toBe(expected)
	})

	/*
	 * ⚠️ Optional on the *output* type, and that is what it is for. TanStack derives whether `search` is a
	 * required prop from it: a non-optional `page` would force every `<Link to="/shops">` in the app to
	 * pass `search={{ page: 1 }}` and emit `/shops?page=1` — a second URL for page 1, competing in the index
	 * with the canonical this same file emits.
	 */
	it('leaves the parameter absent when the URL carries none', () => {
		expect(shopsRouteOptions.validateSearch.parse({}).page).toBeUndefined()
	})

	// Normalised in `loaderDeps` and not in the loader, so an absent `?page=` and an explicit `?page=1`
	// produce one cache key rather than two for the same page.
	it('normalises an absent page to 1 before the loader is keyed', () => {
		expect(shopsRouteOptions.loaderDeps({ search: {} })).toEqual({ page: 1 })
		expect(shopsRouteOptions.loaderDeps({ search: { page: 1 } })).toEqual({ page: 1 })
		expect(shopsRouteOptions.loaderDeps({ search: { page: 5 } })).toEqual({ page: 5 })
	})
})

describe('the shops route head', () => {
	it('titles the first page without a page number', () => {
		expect(titleOf(head(1, ['rivers-boutique']))).toBe('All shops · Marketplace')
		expect(metaOf(head(1, []), 'robots')).toBeUndefined()
	})

	/*
	 * ⚠️ Page 2 and beyond are `noindex` — a deep listing page has no content of its own and competes with
	 * page 1 for the same query. `noindex, follow` keeps the shop pages it links to reachable, which is the
	 * only thing these pages are for.
	 */
	it('keeps the deeper pages out of the index without cutting their links', () => {
		expect(titleOf(head(2, []))).toBe('All shops — page 2 · Marketplace')
		expect(metaOf(head(2, []), 'robots')).toBe('noindex, follow')
	})

	/*
	 * ⚠️ Self-referential, never pointed back at page 1. A canonical that lies about which page this is
	 * invites the crawler to drop the page's links along with the page.
	 */
	it('keeps the canonical on the page it describes', () => {
		expect(canonicalOf(head(1, []))).toBe('http://127.0.0.1:3045/shops')
		expect(canonicalOf(head(3, []))).toBe('http://127.0.0.1:3045/shops?page=3')
	})

	// `rel="prev"`/`rel="next"` is what says the pages are one sequence rather than 400 near-duplicates.
	it('chains the pages together, absolutely', () => {
		const middle = head(2, [], true)

		expect(linkOf(middle, 'prev')).toBe('http://127.0.0.1:3045/shops')
		expect(linkOf(middle, 'next')).toBe('http://127.0.0.1:3045/shops?page=3')
	})

	it('describes the listing, since a title alone is not what a result snippet shows', () => {
		expect(metaOf(head(1, []), 'description')).toBe('Every shop on the platform, with what they sell and where to find them.')
	})

	/*
	 * ⚠️ The whole array on both ends, not `linkOf(…, 'prev')` twice. Each link is spread from a conditional
	 * array, so an absent one is the *empty* branch producing nothing — and anything else that branch might
	 * produce is invisible to a reader that searches the array by `rel`.
	 */
	it('emits no previous on the first page and no next on the last', () => {
		expect(head(1, [], true).links).toEqual([
			{ rel: 'canonical', href: 'http://127.0.0.1:3045/shops' },
			{ rel: 'next', href: 'http://127.0.0.1:3045/shops?page=2' }
		])
		expect(head(2, [], false).links).toEqual([
			{ rel: 'canonical', href: 'http://127.0.0.1:3045/shops?page=2' },
			{ rel: 'prev', href: 'http://127.0.0.1:3045/shops' }
		])
	})

	it('describes the trail that led here', () => {
		expect(jsonLdTyped(head(1, []), 'BreadcrumbList')?.itemListElement).toEqual([
			{ '@type': 'ListItem', position: 1, name: 'Home', item: 'http://127.0.0.1:3045/' },
			{ '@type': 'ListItem', position: 2, name: 'Shops', item: 'http://127.0.0.1:3045/shops' }
		])
	})

	/*
	 * ⚠️ The positions are global, not per page: page 3 declares 49–72. Restarting at 1 on every page tells
	 * a crawler it is looking at three different lists that all begin with a first result.
	 */
	it('numbers the list from where the page actually starts', () => {
		const list = jsonLdTyped(head(3, ['rivers-boutique']), 'ItemList')

		expect(list?.itemListElement).toEqual([
			{ '@type': 'ListItem', position: 49, url: 'http://127.0.0.1:3045/shop/rivers-boutique' }
		])
	})

	// Called on the server before the loader resolves, and again on a router the loader never ran for. The
	// `hasMore` fallback is `false` rather than `true`: a placeholder head that advertises a page 2 is a
	// `rel="next"` pointing at a URL nothing has said exists.
	it('survives being called before the loader has answered', () => {
		const empty = shopsRouteOptions.head({} as Parameters<typeof shopsRouteOptions.head>[0]) as RouteHead

		expect(titleOf(empty)).toBe('All shops · Marketplace')
		expect(jsonLdTyped(empty, 'ItemList')?.itemListElement).toEqual([])
		expect(linkOf(empty, 'next')).toBeUndefined()
	})
})
