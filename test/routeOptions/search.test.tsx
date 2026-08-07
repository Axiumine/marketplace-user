import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { searchRouteOptions } from '@/routeOptions/search'

import type { FixtureCompany, FixtureItem } from '../helpers/catalogue'
import { companyOf, itemOf } from '../helpers/catalogue'
import type { GraphQLReply } from '../helpers/graphql'
import { stubGraphQL } from '../helpers/graphql'
import type { RouteHead } from '../helpers/head'
import { canonicalOf, metaOf, titleOf } from '../helpers/head'
import { renderRoute } from '../helpers/render'

const searchReply = (companies: readonly FixtureCompany[], items: readonly FixtureItem[]): GraphQLReply => ({
	data: { search: { companies, items } }
})

const mount = async (path: string, reply: GraphQLReply = searchReply([companyOf()], [itemOf()])) => {
	const stub = stubGraphQL({ Search: reply })
	const result = await renderRoute(path)

	return { ...result, stub }
}

const head = (q?: string): RouteHead =>
	searchRouteOptions.head(
		(q === undefined ? {} : { loaderData: { q, companies: [], items: [] } }) as Parameters<typeof searchRouteOptions.head>[0]
	) as RouteHead

const parse = (search: Record<string, unknown>) => searchRouteOptions.validateSearch.parse(search)

describe('the search route', () => {
	it('sends the query and one screen of each kind', async () => {
		const { stub } = await mount('/search?q=satchel')

		expect(stub.calls[0]?.operationName).toBe('Search')
		expect(stub.calls[0]?.variables).toEqual({ q: 'satchel', near: undefined, limit: 24 })
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
	 * ⚠️ The loader is called directly, because the two empty arrays it returns for an empty query are
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
			deps: { q: '   ' }
		})

		expect(result).toEqual({ q: '', companies: [], items: [] })
	})

	it('trims the query before sending it', async () => {
		const { stub } = await mount('/search?q=%20satchel%20')

		expect(stub.calls[0]?.variables).toMatchObject({ q: 'satchel' })
	})

	it('renders the shops and the items it found, as real links', async () => {
		await mount('/search?q=rossi')

		expect(within(screen.getByRole('region', { name: 'Shops' })).getByRole('link', { name: /Bottega Rossi/ })).toHaveAttribute(
			'href',
			'/shop/bottega-rossi'
		)
		expect(within(screen.getByRole('region', { name: 'Items' })).getByRole('link', { name: /Leather satchel/ })).toHaveAttribute(
			'href',
			'/shop/bottega-rossi/item/leather-satchel'
		)
	})

	/*
	 * ⚠️ Both halves are asserted, the absent one *and* the one that stayed. Half the results missing and
	 * "Nothing found" render the same absence, so a test that only looks for what is gone passes on a page
	 * that found nothing at all — which is what an `||` in place of the `&&` behind "nothing" produces.
	 */
	it.each([
		['no shops matched', searchReply([], [itemOf()]), 'Shops', 'Items'],
		['no items matched', searchReply([companyOf()], []), 'Items', 'Shops']
	])('drops the empty half of the results when %s', async (_label, reply, absent, present) => {
		await mount('/search?q=rossi', reply)

		expect(screen.queryByRole('region', { name: absent })).not.toBeInTheDocument()
		expect(screen.getByRole('region', { name: present })).toBeInTheDocument()
		expect(screen.queryByText(/Nothing found/)).not.toBeInTheDocument()
	})

	it('says so when a real query matched nothing', async () => {
		await mount('/search?q=zzz', searchReply([], []))

		expect(screen.getByText('Nothing found for “zzz”')).toBeInTheDocument()
	})

	// Scoped to the page's own box: the header carries a second one, and that one stays empty — it is the
	// same component, and seeding it here is what makes the query editable rather than retypeable.
	it('keeps the query in the box, so it can be edited rather than retyped', async () => {
		await mount('/search?q=satchel')

		expect(within(screen.getByRole('main')).getByRole('searchbox')).toHaveValue('satchel')
	})
})

/*
 * ⚠️ `near` is three numbers in one parameter, `lng,lat,radius`, in GeoJSON order — the same order the API
 * speaks, so nothing is swapped anywhere between the URL and the query. One parameter is atomic: a link
 * cannot carry two thirds of a location.
 */
describe('the search parameters', () => {
	it('reads a location out of one parameter', async () => {
		const { stub } = await mount('/search?q=pane&near=9.19%2C45.46%2C5000')

		expect(stub.calls[0]?.variables).toEqual({
			q: 'pane',
			near: { lng: 9.19, lat: 45.46, radiusMeters: 5000 },
			limit: 24
		})
	})

	/*
	 * ⚠️ A malformed `near` is dropped, not an error. These URLs are shared, truncated by chat clients and
	 * rewritten by every link shortener on the internet — a 500 on a mistyped coordinate answers a crawler's
	 * request with a server error, where a plain text search answers with results.
	 */
	it.each([
		['two of the three numbers', '9.19,45.46'],
		['a fourth number', '9.19,45.46,5000,7'],
		['a longitude off the globe', '181,45.46,5000'],
		['a latitude off the globe', '9.19,91,5000'],
		['words instead of numbers', 'here,there,near'],
		['a radius of nothing', '9.19,45.46,0'],
		// Capped rather than merely positive: an unbounded radius is a scan over the whole collection dressed
		// up as a geo search, and it is reachable by anyone who can edit a URL.
		['a radius past 100 km', '9.19,45.46,100001']
	])('drops a location carrying %s', (_label, near) => {
		expect(parse({ q: 'pane', near }).near).toBeUndefined()
	})

	it('accepts the radius exactly at the cap', () => {
		expect(parse({ q: 'pane', near: '9.19,45.46,100000' }).near?.radiusMeters).toBe(100_000)
	})

	// `q` is `.catch('')` for the same reason: a missing or non-string `q` renders the search box, never an
	// error boundary.
	it.each([[{}], [{ q: 42 }]])('reads a missing or unusable q as an empty search: %j', (search) => {
		expect(parse(search).q).toBe('')
	})

	it('keys the loader on the whole search, so a new location refetches', () => {
		const search = { q: 'pane', near: { lng: 9.19, lat: 45.46, radiusMeters: 5000 } }

		expect(searchRouteOptions.loaderDeps({ search })).toEqual(search)
	})
})

describe('the search route head', () => {
	it('names the query in the title, once there is one', () => {
		expect(titleOf(head(''))).toBe('Search · Marketplace')
		expect(titleOf(head('satchel'))).toBe('Search — satchel · Marketplace')
		expect(titleOf(head())).toBe('Search · Marketplace')
	})

	/*
	 * ⚠️ Every search page is `noindex`, and the canonical is the bare `/search`. A results URL is generated
	 * content with no page behind it: indexed, it fills the site's index with thin near-duplicates that
	 * compete with the listing and category pages meant to rank, and anyone can mint an unlimited number of
	 * them by varying `q`. The results are still real `<a href>`s — `noindex` says "do not keep this page",
	 * not "do not read it".
	 */
	it('keeps every variation of the query out of the index, and collapses them into one URL', () => {
		expect(metaOf(head('satchel'), 'robots')).toBe('noindex, follow')
		expect(canonicalOf(head('satchel'))).toBe('http://127.0.0.1:3045/search')
	})

	// The description does not name the query, deliberately: it is the same page whatever was typed, and it
	// is the description a link preview shows when the URL is shared into a chat.
	it('describes the page rather than the query', () => {
		expect(metaOf(head('satchel'), 'description')).toBe('Search shops and items across the platform.')
		expect(metaOf(head(''), 'description')).toBe('Search shops and items across the platform.')
	})
})
