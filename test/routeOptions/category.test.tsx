import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { categoryRouteOptions } from '@/routeOptions/category'
import { categoryChildRouteOptions } from '@/routeOptions/categoryChild'
import type { CategoryLoaderResult } from '@/routeOptions/categoryCommon'
import { categoryHead } from '@/routeOptions/categoryCommon'

import type { FixtureCategory } from '../helpers/catalogue'
import { categoriesReply, itemOf, itemsReply } from '../helpers/catalogue'
import type { GraphQLReply } from '../helpers/graphql'
import { stubGraphQL } from '../helpers/graphql'
import type { RouteHead } from '../helpers/head'
import { canonicalOf, jsonLdTyped, linkOf, metaOf, titleOf } from '../helpers/head'
import { renderRoute } from '../helpers/render'

const mount = async (path: string, items: GraphQLReply = itemsReply([itemOf()]), rows?: readonly FixtureCategory[]) => {
	const stub = stubGraphQL({ ItemCategories: categoriesReply(rows), Items: items })
	const result = await renderRoute(path)

	return { ...result, stub }
}

const APPAREL: FixtureCategory = { _id: 'cat-apparel', idParent: null, name: 'Apparel', slug: 'apparel', position: 1 }
const FOOTWEAR: FixtureCategory = {
	_id: 'cat-footwear',
	idParent: 'cat-apparel',
	name: 'Footwear',
	slug: 'footwear',
	position: 1
}

const resultOf = (over: Partial<CategoryLoaderResult> = {}): CategoryLoaderResult =>
	({
		category: APPAREL,
		children: [],
		crumbs: [
			{ name: 'Home', path: '/' },
			{ name: 'Apparel', path: '/category/apparel' }
		],
		items: { nodes: [], total: 0, totalIsExact: true, hasMore: false },
		page: 1,
		basePath: '/category/apparel',
		...over
	}) as CategoryLoaderResult

/*
 * ⚠️ Through the route's own `head`, not `categoryHead` directly. Each of the two routes carries a
 * one-line adapter that hands its `loaderData` to the shared builder, and a suite that calls the builder
 * itself never reads those two lines — an adapter that answered nothing at all would satisfy every
 * assertion below, and the pages would ship with no title, no canonical and no structured data.
 *
 * `{}` rather than `{ loaderData: undefined }` because `exactOptionalPropertyTypes` refuses the explicit
 * `undefined`, and because the absent property is the real shape: it is what the router passes before the
 * loader has answered.
 */
const head = (result?: CategoryLoaderResult): RouteHead =>
	categoryRouteOptions.head(result === undefined ? {} : { loaderData: result }) as RouteHead

describe('the category route', () => {
	/*
	 * ⚠️ The whole tree in one request, then the items. The tree is two levels and small enough to fetch
	 * whole — every public page needs it for the navigation, so one cached query beats a per-level fetch.
	 */
	it('resolves the slug against the tree, then loads the items by category id', async () => {
		const { stub } = await mount('/category/apparel')

		expect(stub.calls.map((call) => call.operationName)).toEqual(['ItemCategories', 'Items'])
		expect(stub.calls[1]?.variables).toEqual({ idCategory: 'cat-apparel', limit: 24, offset: 0 })
	})

	it('offsets the item query by the page in the URL', async () => {
		const { stub } = await mount('/category/apparel?page=2')

		expect(stub.calls[1]?.variables).toEqual({ idCategory: 'cat-apparel', limit: 24, offset: 24 })
	})

	it('renders the category and its items', async () => {
		await mount('/category/apparel')

		expect(screen.getByRole('heading', { level: 1, name: 'Apparel' })).toBeInTheDocument()
		expect(screen.getByRole('link', { name: /Leather satchel/ })).toHaveAttribute(
			'href',
			'/shop/rivers-boutique/item/leather-satchel'
		)
	})

	// A category the operator created and nobody has filled yet is a real page, not a 404 — it exists on
	// purpose, and it is the URL the operator will link to once there is something in it.
	it('renders an empty category rather than 404ing it', async () => {
		await mount('/category/apparel', itemsReply([]))

		expect(screen.getByRole('heading', { level: 1, name: 'Apparel' })).toBeInTheDocument()
		expect(screen.getByText('Nothing published under this category yet')).toBeInTheDocument()
	})

	it('404s a slug that is in no tree', async () => {
		await mount('/category/nowhere')

		expect(screen.getByRole('heading', { level: 1, name: 'This page does not exist' })).toBeInTheDocument()
	})

	/*
	 * ⚠️ The subcategories are links, and they sit above the items. A top-level category is a hub page and
	 * its value to a crawler is what it links out to; below 24 item cards is below the point most crawls
	 * stop reading.
	 */
	it('links its subcategories, ahead of the items', async () => {
		await mount('/category/apparel')

		const subcategories = screen.getByRole('navigation', { name: 'Subcategories' })

		expect(within(subcategories).getByRole('link', { name: 'Footwear' })).toHaveAttribute('href', '/category/apparel/footwear')
		expect(subcategories.compareDocumentPosition(screen.getByRole('link', { name: /Leather satchel/ }))).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING
		)
	})

	// Ordered by the operator's `position`, ties broken by name with the same `en-GB` collator the
	// navigation uses, so the two orderings can never disagree.
	it('orders the subcategories by position, then by name', async () => {
		await mount('/category/apparel', itemsReply([]), [
			APPAREL,
			{ _id: 'cat-z', idParent: 'cat-apparel', name: 'Zippers', slug: 'zippers', position: 1 },
			{ _id: 'cat-a', idParent: 'cat-apparel', name: 'Àprons', slug: 'aprons', position: 1 },
			{ _id: 'cat-first', idParent: 'cat-apparel', name: 'Bags', slug: 'bags', position: 0 }
		])

		const links = within(screen.getByRole('navigation', { name: 'Subcategories' })).getAllByRole('link')

		expect(links.map((link) => link.textContent)).toEqual(['Bags', 'Àprons', 'Zippers'])
	})

	it('shows no subcategory navigation when there are none', async () => {
		await mount('/category/handmade')

		expect(screen.queryByRole('navigation', { name: 'Subcategories' })).not.toBeInTheDocument()
	})
})

/*
 * ⚠️ The trail is asserted on the rendered page, not on a hand-built fixture. The loader builds one crumb
 * array and hands it to both `Breadcrumbs` and the `BreadcrumbList` JSON-LD, so the rendered trail is the
 * only place that construction is observable end to end — a fixture that spells the crumbs out asserts
 * the assertion instead of the code.
 *
 * The length is asserted alongside the contents because the parent crumb is spread from a conditional
 * array: an extra element and a missing one are both silent if only the crumbs that *are* there get read.
 */
describe('the category breadcrumb trail', () => {
	const trail = () => within(screen.getByRole('navigation', { name: 'Breadcrumb' }))

	it('walks Home → category on a top-level page, with the current page as text', async () => {
		await mount('/category/apparel')

		expect(trail().getAllByRole('listitem')).toHaveLength(2)
		expect(trail().getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
		expect(trail().getByText('Apparel')).toHaveAttribute('aria-current', 'page')
	})

	it('inserts the parent between Home and the subcategory', async () => {
		await mount('/category/apparel/footwear')

		expect(trail().getAllByRole('listitem')).toHaveLength(3)
		expect(
			trail()
				.getAllByRole('link')
				.map((link) => [link.textContent, link.getAttribute('href')])
		).toEqual([
			['Home', '/'],
			['Apparel', '/category/apparel']
		])
		expect(trail().getByText('Footwear')).toHaveAttribute('aria-current', 'page')
	})
})

/*
 * ⚠️ Slugs are unique across both levels, so `/category/anything/real-child` resolves the child perfectly
 * well — which is exactly why the URL is checked against the category's real position. Without the check
 * every subcategory would have as many working, indexable URLs as there are category slugs, all with
 * identical content, and any of them could be minted by hand.
 *
 * The redirects are **301, not the router's default 307**: a 307 says "this URL is fine, look over there
 * for now", so a crawler keeps the wrong URL and keeps requesting it. These mismatches are permanent by
 * construction — a child's parent cannot change without the child's slug changing too.
 */
describe('the canonical category URL', () => {
	it('renders a subcategory requested under its real parent', async () => {
		const { router } = await mount('/category/apparel/footwear')

		expect(router.state.location.pathname).toBe('/category/apparel/footwear')
		expect(screen.getByRole('heading', { level: 1, name: 'Footwear' })).toBeInTheDocument()
	})

	it('sends a subcategory requested without its parent to the nested URL', async () => {
		const { router } = await mount('/category/footwear')

		expect(router.state.location.pathname).toBe('/category/apparel/footwear')
	})

	it('sends a subcategory requested under the wrong parent to the right one', async () => {
		const { router } = await mount('/category/handmade/footwear')

		expect(router.state.location.pathname).toBe('/category/apparel/footwear')
	})

	it('sends a top-level category requested with a parent segment back up a level', async () => {
		const { router } = await mount('/category/handmade/apparel')

		expect(router.state.location.pathname).toBe('/category/apparel')
	})

	it('404s an unknown child slug rather than redirecting somewhere plausible', async () => {
		await mount('/category/apparel/nowhere')

		expect(screen.getByRole('heading', { level: 1, name: 'This page does not exist' })).toBeInTheDocument()
	})
})

describe('the category search parameter', () => {
	it.each([
		[categoryRouteOptions, 'the category route'],
		[categoryChildRouteOptions, 'the subcategory route']
	])('clamps and normalises the page on %#: %s', (options) => {
		expect(options.validateSearch.parse({ page: 'abc' }).page).toBe(1)
		expect(options.validateSearch.parse({ page: '6' }).page).toBe(6)
		expect(options.validateSearch.parse({}).page).toBeUndefined()
		expect(options.loaderDeps({ search: {} })).toEqual({ page: 1 })
		expect(options.loaderDeps({ search: { page: 3 } })).toEqual({ page: 3 })
	})
})

describe('the category head', () => {
	it('titles the page with the category, and the page after the first', () => {
		expect(titleOf(head(resultOf()))).toBe('Apparel · Marketplace')
		expect(titleOf(head(resultOf({ page: 2 })))).toBe('Apparel — page 2 · Marketplace')
	})

	// Page 1 carries no `robots` tag at all. Asserted from both sides: a `noIndex` that is always true
	// keeps the whole category out of the index, which is the more expensive of the two failures and the
	// one an assertion on page 2 alone cannot see.
	it('noindexes every page but the first', () => {
		expect(metaOf(head(resultOf()), 'robots')).toBeUndefined()
		expect(metaOf(head(resultOf({ page: 2 })), 'robots')).toBe('noindex, follow')
	})

	it('describes the category as a cross-shop listing', () => {
		expect(metaOf(head(resultOf()), 'description')).toBe('Every item published under Apparel, from every shop on the platform.')
	})

	// The canonical is the *nested* path for a subcategory, whichever URL was requested — that is the whole
	// point of the 301 above, and a canonical pointing at the short form would undo it.
	it('canonicalises a subcategory under its parent', () => {
		const child = resultOf({ category: FOOTWEAR, parent: APPAREL, basePath: '/category/apparel/footwear' })

		expect(canonicalOf(head(child))).toBe('http://127.0.0.1:3045/category/apparel/footwear')
		expect(canonicalOf(head(resultOf({ page: 3 })))).toBe('http://127.0.0.1:3045/category/apparel?page=3')
	})

	it('chains the pages together, absolutely', () => {
		const middle = resultOf({ page: 2, items: { nodes: [], total: 0, totalIsExact: true, hasMore: true } })

		expect(linkOf(head(middle), 'prev')).toBe('http://127.0.0.1:3045/category/apparel')
		expect(linkOf(head(middle), 'next')).toBe('http://127.0.0.1:3045/category/apparel?page=3')
	})

	/*
	 * ⚠️ The whole array, not `linkOf(…, 'prev')` twice. Both ends are spread from a conditional array, so
	 * an absent link is the *empty* branch producing nothing — and anything else that branch might produce
	 * is invisible to a reader that searches the array by `rel`.
	 */
	it('emits the canonical alone on a single-page category', () => {
		expect(head(resultOf()).links).toEqual([{ rel: 'canonical', href: 'http://127.0.0.1:3045/category/apparel' }])
	})

	it('emits the same crumbs the page renders', () => {
		expect(jsonLdTyped(head(resultOf()), 'BreadcrumbList')?.itemListElement).toEqual([
			{ '@type': 'ListItem', position: 1, name: 'Home', item: 'http://127.0.0.1:3045/' },
			{ '@type': 'ListItem', position: 2, name: 'Apparel', item: 'http://127.0.0.1:3045/category/apparel' }
		])
	})

	it('lists the items on the page, numbered from where the page starts', () => {
		const second = resultOf({
			page: 2,
			items: {
				nodes: [{ companySlug: 'rivers-boutique', slug: 'leather-satchel' }],
				total: 1,
				totalIsExact: true,
				hasMore: false
			}
		} as Partial<CategoryLoaderResult>)

		expect(jsonLdTyped(head(second), 'ItemList')?.itemListElement).toEqual([
			{ '@type': 'ListItem', position: 25, url: 'http://127.0.0.1:3045/shop/rivers-boutique/item/leather-satchel' }
		])
	})

	// The placeholder describes nothing on purpose: it stands in for a page whose category is not known
	// yet, and inventing a description for it would be a description of the wrong page.
	it('emits a bare head before the loader answers', () => {
		expect(titleOf(head())).toBe('Category · Marketplace')
		expect(canonicalOf(head())).toBe('http://127.0.0.1:3045/shops')
		expect(metaOf(head(), 'description')).toBe('')
	})

	/*
	 * ⚠️ The subcategory route builds its head from the same loader result and the same builder, so
	 * everything asserted above holds for it too — but only as long as its adapter really delegates. The
	 * two routes are separate files with a line each, and this is the one assertion that reads the second
	 * one; without it that page can lose its whole head and no test notices.
	 */
	it('describes a subcategory page with the same builder the parent uses', () => {
		const child = resultOf({ category: FOOTWEAR, basePath: '/category/apparel/footwear' })

		expect(categoryChildRouteOptions.head({ loaderData: child })).toEqual(categoryHead(child))
		expect(categoryChildRouteOptions.head({})).toEqual(categoryHead(undefined))
	})
})
