import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { homeRouteOptions } from '@/routeOptions/home'

import { CATEGORIES, categoriesReply, companiesReply, companyOf } from '../helpers/catalogue'
import type { GraphQLReplies } from '../helpers/graphql'
import { stubGraphQL } from '../helpers/graphql'
import type { RouteHead } from '../helpers/head'
import { canonicalOf, jsonLdTyped, metaOf, titleOf } from '../helpers/head'
import { installOnlineListenerGuard } from '../helpers/onlineListenerGuard'
import { renderRoute } from '../helpers/render'

installOnlineListenerGuard()

/* ⚠️ The island is stubbed, and only the island: it needs a WebGL context jsdom does not have, and what
 * matters here is what the page hands it. `test/helpers/mapIsland.ts` says the rest. */
vi.mock('@/features/map/MapIsland', async () => (await import('../helpers/mapIsland')).mapIslandStub())

const OTHER = companyOf({ _id: '66b0000000000000000000c2', publicName: 'Green Boutique', slug: 'green-boutique' })

const homeReplies = (companies: GraphQLReplies['Companies']): GraphQLReplies => ({
	Companies: companies,
	ItemCategories: categoriesReply()
})

const mount = async (companies = companiesReply([companyOf(), OTHER])) => {
	const stub = stubGraphQL(homeReplies(companies))
	const result = await renderRoute('/')

	return { ...result, stub }
}

const head = (nodes: readonly { slug: string }[]): RouteHead =>
	homeRouteOptions.head({
		loaderData: {
			companies: { nodes, total: nodes.length, totalIsExact: true, hasMore: false },
			categories: CATEGORIES
		}
	} as Parameters<typeof homeRouteOptions.head>[0]) as RouteHead

describe('the home route', () => {
	it('asks for one screen of shops and the whole category tree', async () => {
		const { stub } = await mount()

		expect(stub.calls.map((call) => call.operationName).sort()).toEqual(['Companies', 'ItemCategories'])
		expect(stub.calls.find((call) => call.operationName === 'Companies')?.variables).toEqual({ limit: 12, offset: 0 })
	})

	it('renders the shops it loaded, as headings a crawler can read', async () => {
		await mount()

		expect(screen.getByRole('heading', { level: 1, name: 'Shops near you' })).toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Rivers Boutique' })).toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Green Boutique' })).toBeInTheDocument()
	})

	it('offers the categories beside the shops', async () => {
		await mount()

		expect(
			within(screen.getByRole('navigation', { name: 'Categories' })).getByRole('link', { name: 'Apparel' })
		).toBeInTheDocument()
	})

	/*
	 * ⚠️ The cards are server-rendered and the map is not, and that asymmetry is the whole SEO design. Every
	 * shop on this page is reachable as a real `<a href>`; the map is a second way to look at the same set.
	 * If the cards ever become client-only the catalogue silently stops being indexed.
	 */
	it('links every shop it shows, whatever the map does', async () => {
		await mount()

		expect(screen.getByRole('link', { name: /Rivers Boutique/ })).toHaveAttribute('href', '/shop/rivers-boutique')
	})

	it('hands the map the shops it already has, so it does not refetch them', async () => {
		await mount()

		expect(screen.getByTestId('map')).toHaveTextContent('rivers-boutique green-boutique')
	})

	/*
	 * A shop with no coordinates cannot be a pin. `flatMap` drops it rather than plotting `undefined`,
	 * which MapLibre reads as latitude `NaN`.
	 *
	 * ⚠️ Both spellings of "no coordinates" get a case, because the guard tests for them separately: a
	 * resolver that has none omits the field, and the codegen type spells the absence `null`.
	 *
	 * ⚠️ The map's text is asserted **whole**, not by substring. What the dropped branch contributes is
	 * *nothing*, and nothing is invisible to an assertion that only looks for the pin that is there — a
	 * second pin appended after `rivers-boutique` would satisfy `toHaveTextContent` just as well.
	 */
	it.each([
		['a null position', null],
		['no position field at all', undefined]
	])('leaves a shop with %s off the map, and on the page', async (_label, position) => {
		const placeless = companyOf({
			_id: '66b0000000000000000000c3',
			publicName: 'White Tailoring',
			slug: 'white-tailoring',
			address: { ...companyOf().address, position }
		})

		await mount(companiesReply([companyOf(), placeless]))

		expect(screen.getByTestId('map').textContent).toBe('-98.5795,39.8283 @ 5 · rivers-boutique')
		expect(screen.getByRole('heading', { name: 'White Tailoring' })).toBeInTheDocument()
	})

	it('frames the country rather than asking for the visitor’s location', async () => {
		await mount()

		expect(screen.getByTestId('map')).toHaveTextContent('-98.5795,39.8283 @ 5')
	})

	it('offers the full listing only when there is more to see', async () => {
		await mount(companiesReply([companyOf()], { hasMore: true }))

		expect(screen.getByRole('link', { name: 'See all shops' })).toHaveAttribute('href', '/shops')
	})

	it('does not offer a second page that does not exist', async () => {
		await mount(companiesReply([companyOf()], { hasMore: false }))

		expect(screen.queryByRole('link', { name: 'See all shops' })).not.toBeInTheDocument()
	})

	it('says so when nothing is published yet', async () => {
		await mount(companiesReply([]))

		expect(screen.getByText('No shops are published yet')).toBeInTheDocument()
		expect(screen.queryByRole('link', { name: 'See all shops' })).not.toBeInTheDocument()
	})
})

describe('the home route head', () => {
	// The site name alone, with no ` · Marketplace` suffix — `headFor` special-cases it, and a home page
	// titled "Marketplace · Marketplace" is the first thing anyone notices in a search result.
	it('is titled with the site name, once', () => {
		expect(titleOf(head([]))).toBe('Marketplace')
	})

	it('describes the site and points the canonical at the root', () => {
		expect(metaOf(head([]), 'description')).toBe('Browse shops near you and everything they offer, on one map.')
		expect(canonicalOf(head([]))).toBe('http://127.0.0.1:3045/')
	})

	it('declares the site itself, for the sitelinks search box', () => {
		expect(jsonLdTyped(head([]), 'WebSite')).toBeDefined()
	})

	it('lists the shops it rendered, as absolute URLs', () => {
		const list = jsonLdTyped(head([{ slug: 'rivers-boutique' }, { slug: 'green-boutique' }]), 'ItemList')

		expect(list?.itemListElement).toEqual([
			{ '@type': 'ListItem', position: 1, url: 'http://127.0.0.1:3045/shop/rivers-boutique' },
			{ '@type': 'ListItem', position: 2, url: 'http://127.0.0.1:3045/shop/green-boutique' }
		])
	})

	/*
	 * ⚠️ `head()` runs before the loader has answered on a first render, so `loaderData` is genuinely
	 * `undefined` there. Reading `.companies` off it would throw inside head generation and take the whole
	 * document down — the `?? []` is what keeps a slow query from being a blank page.
	 */
	it('emits an empty list rather than throwing before the loader answers', () => {
		const withoutData = homeRouteOptions.head({} as Parameters<typeof homeRouteOptions.head>[0]) as RouteHead

		expect(jsonLdTyped(withoutData, 'ItemList')?.itemListElement).toEqual([])
	})
})
