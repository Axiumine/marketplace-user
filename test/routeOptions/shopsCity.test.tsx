import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { shopsCityRouteOptions } from '@/routeOptions/shopsCity'

import { companiesReply, companyOf } from '../helpers/catalogue'
import type { GraphQLReply } from '../helpers/graphql'
import { stubGraphQL } from '../helpers/graphql'
import type { RouteHead } from '../helpers/head'
import { canonicalOf, jsonLdTyped, linkOf, metaOf, titleOf } from '../helpers/head'
import { renderRoute } from '../helpers/render'

const mount = async (path: string, companies: GraphQLReply = companiesReply([companyOf()])) => {
	const stub = stubGraphQL({ Companies: companies })
	const result = await renderRoute(path)

	return { ...result, stub }
}

const head = (city: string, page: number, slugs: readonly string[] = [], hasMore = false): RouteHead =>
	shopsCityRouteOptions.head({
		loaderData: {
			companies: { nodes: slugs.map((slug) => ({ slug })), total: slugs.length, totalIsExact: true, hasMore },
			city,
			page
		}
	} as Parameters<typeof shopsCityRouteOptions.head>[0]) as RouteHead

describe('the city listing route', () => {
	/*
	 * ⚠️ The segment is the city name verbatim, because the resolver matches `address.city` for equality
	 * and there is no slug column to match instead. Lowercasing it, hyphenating its spaces or stripping its
	 * accents produces a page that renders zero results and reports no error anywhere.
	 */
	it('asks for the city exactly as the URL spells it', async () => {
		const { stub } = await mount('/shops/Reggio%20Emilia')

		expect(stub.calls[0]?.variables).toEqual({ limit: 24, offset: 0, city: 'Reggio Emilia' })
	})

	// Surrounding space is the one deviation allowed, and it is trimmed rather than sent: `city: ' Milano'`
	// matches nothing, and a link that picked up a stray space would 404 a city that exists.
	it('trims the segment before querying', async () => {
		const { stub } = await mount('/shops/%20Milano%20')

		expect(stub.calls[0]?.variables).toEqual({ limit: 24, offset: 0, city: 'Milano' })
	})

	it('offsets the query by the page in the URL', async () => {
		const { stub } = await mount('/shops/Milano?page=2')

		expect(stub.calls[0]?.variables).toEqual({ limit: 24, offset: 24, city: 'Milano' })
	})

	it('renders the city listing under its own heading', async () => {
		await mount('/shops/Milano')

		expect(screen.getByRole('heading', { level: 1, name: 'Shops in Milano' })).toBeInTheDocument()
		expect(screen.getByText(/shops here/).textContent).toBe('1 shops here.')
		expect(screen.getByRole('link', { name: /Bottega Rossi/ })).toHaveAttribute('href', '/shop/bottega-rossi')
	})

	/*
	 * ⚠️ A city with no published shops is a real 404, not an empty listing. Left as a 200 it is an
	 * indexable page with no content, and anyone can mint an unlimited number of them by typing nonsense
	 * into the segment — which is how a catalogue ends up with more empty URLs than real ones.
	 */
	it('404s a city that has no shops at all', async () => {
		await mount('/shops/Atlantide', companiesReply([]))

		expect(screen.getByRole('heading', { level: 1, name: 'This page does not exist' })).toBeInTheDocument()
	})

	// Exempt on purpose: an out-of-range `?page=` on a real city is a bad parameter, not a missing city.
	it('shows an empty page rather than a 404 past the end of a real city', async () => {
		await mount('/shops/Milano?page=9', companiesReply([]))

		expect(screen.getByText('No shops on this page')).toBeInTheDocument()
		expect(screen.queryByRole('heading', { name: 'This page does not exist' })).not.toBeInTheDocument()
	})

	it('keeps the city encoded in its own pagination links', async () => {
		await mount('/shops/Reggio%20Emilia?page=2', companiesReply([companyOf()], { hasMore: true }))

		expect(screen.getByRole('link', { name: '← Previous' })).toHaveAttribute('href', '/shops/Reggio%20Emilia')
		expect(screen.getByRole('link', { name: 'Next →' })).toHaveAttribute('href', '/shops/Reggio%20Emilia?page=3')
	})

	// The trail is Home → Shops → city, and the city is the current page: text with `aria-current`, never a
	// link to where the visitor already is.
	it('places the city under the shops listing in the trail', async () => {
		await mount('/shops/Milano')

		const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }))

		expect(trail.getAllByRole('listitem')).toHaveLength(3)
		expect(trail.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
			['Home', '/'],
			['Shops', '/shops']
		])
		expect(trail.getByText('Milano')).toHaveAttribute('aria-current', 'page')
		expect(trail.queryByRole('link', { name: 'Milano' })).not.toBeInTheDocument()
	})
})

describe('the city listing search parameter', () => {
	it.each([
		['abc', 1],
		['0', 1],
		['7', 7]
	])('reads ?page=%s as page %i', (raw, expected) => {
		expect(shopsCityRouteOptions.validateSearch.parse({ page: raw }).page).toBe(expected)
	})

	it('normalises an absent page to 1 before the loader is keyed', () => {
		expect(shopsCityRouteOptions.loaderDeps({ search: {} })).toEqual({ page: 1 })
		expect(shopsCityRouteOptions.loaderDeps({ search: { page: 4 } })).toEqual({ page: 4 })
	})
})

describe('the city listing head', () => {
	it('names the city in the title, and the page after the first', () => {
		expect(titleOf(head('Milano', 1))).toBe('Shops in Milano · Marketplace')
		expect(titleOf(head('Milano', 2))).toBe('Shops in Milano — page 2 · Marketplace')
	})

	it('describes the city, since that is the query these pages exist for', () => {
		expect(metaOf(head('Milano', 1), 'description')).toBe(
			'Every shop published in Milano, with what they sell and where to find them.'
		)
	})

	it('keeps the deeper pages out of the index without cutting their links', () => {
		expect(metaOf(head('Milano', 1), 'robots')).toBeUndefined()
		expect(metaOf(head('Milano', 3), 'robots')).toBe('noindex, follow')
	})

	// The canonical is built from the same `encodeURIComponent` the links use — a canonical carrying a raw
	// space is a different URL from the one linked to it, and the two split the page's ranking between them.
	it('encodes the city in the canonical', () => {
		expect(canonicalOf(head('Reggio Emilia', 1))).toBe('http://127.0.0.1:3045/shops/Reggio%20Emilia')
		expect(canonicalOf(head('Reggio Emilia', 2))).toBe('http://127.0.0.1:3045/shops/Reggio%20Emilia?page=2')
	})

	it('chains the pages together, absolutely', () => {
		const middle = head('Milano', 2, [], true)

		expect(linkOf(middle, 'prev')).toBe('http://127.0.0.1:3045/shops/Milano')
		expect(linkOf(middle, 'next')).toBe('http://127.0.0.1:3045/shops/Milano?page=3')
	})

	/*
	 * ⚠️ The whole array on both ends, not `linkOf(…, 'prev')` twice. Each link is spread from a conditional
	 * array, so an absent one is the *empty* branch producing nothing — and anything else that branch might
	 * produce is invisible to a reader that searches the array by `rel`.
	 */
	it('emits no previous on the first page and no next on the last', () => {
		expect(head('Milano', 1, [], true).links).toEqual([
			{ rel: 'canonical', href: 'http://127.0.0.1:3045/shops/Milano' },
			{ rel: 'next', href: 'http://127.0.0.1:3045/shops/Milano?page=2' }
		])
		expect(head('Milano', 2, [], false).links).toEqual([
			{ rel: 'canonical', href: 'http://127.0.0.1:3045/shops/Milano?page=2' },
			{ rel: 'prev', href: 'http://127.0.0.1:3045/shops/Milano' }
		])
	})

	it('describes the trail Home → Shops → city', () => {
		expect(jsonLdTyped(head('Milano', 1), 'BreadcrumbList')?.itemListElement).toEqual([
			{ '@type': 'ListItem', position: 1, name: 'Home', item: 'http://127.0.0.1:3045/' },
			{ '@type': 'ListItem', position: 2, name: 'Shops', item: 'http://127.0.0.1:3045/shops' },
			{ '@type': 'ListItem', position: 3, name: 'Milano', item: 'http://127.0.0.1:3045/shops/Milano' }
		])
	})

	it('numbers the list from where the page actually starts', () => {
		expect(jsonLdTyped(head('Milano', 2, ['bottega-rossi']), 'ItemList')?.itemListElement).toEqual([
			{ '@type': 'ListItem', position: 25, url: 'http://127.0.0.1:3045/shop/bottega-rossi' }
		])
	})

	// Called on the server before the loader resolves, and again on a router the loader never ran for. The
	// `hasMore` fallback is `false` rather than `true`: a placeholder head that advertises a page 2 is a
	// `rel="next"` pointing at a URL nothing has said exists.
	it('survives being called before the loader has answered', () => {
		const empty = shopsCityRouteOptions.head({} as Parameters<typeof shopsCityRouteOptions.head>[0]) as RouteHead

		expect(jsonLdTyped(empty, 'ItemList')?.itemListElement).toEqual([])
		expect(canonicalOf(empty)).toBe('http://127.0.0.1:3045/shops/')
		expect(linkOf(empty, 'next')).toBeUndefined()
	})
})
