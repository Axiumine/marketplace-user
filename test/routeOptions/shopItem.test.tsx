import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { shopItemRouteOptions } from '@/routeOptions/shopItem'

import type { FixtureItem } from '../helpers/catalogue'
import { itemOf } from '../helpers/catalogue'
import { stubGraphQL } from '../helpers/graphql'
import type { RouteHead } from '../helpers/head'
import { canonicalOf, jsonLdOf, jsonLdTyped, metaOf, titleOf } from '../helpers/head'
import { installOnlineListenerGuard } from '../helpers/onlineListenerGuard'
import { renderRoute } from '../helpers/render'

installOnlineListenerGuard()

const mount = async (path = '/shop/rivers-boutique/item/leather-satchel', item: FixtureItem | null = itemOf()) => {
	const stub = stubGraphQL({ ItemBySlug: { data: { itemBySlug: item } } })
	const result = await renderRoute(path)

	return { ...result, stub }
}

const head = (item: FixtureItem | null): RouteHead =>
	shopItemRouteOptions.head({
		loaderData: item === null ? undefined : { item }
	} as Parameters<typeof shopItemRouteOptions.head>[0]) as RouteHead

describe('the item route', () => {
	/*
	 * ⚠️ Both segments go to the resolver. An item slug is unique *per company* — the backend's unique index
	 * is `{idCompany, slug}` — so the item slug alone cannot resolve, and a query that sent only it would
	 * answer with whichever shop's item happened to sort first.
	 */
	it('resolves the item by shop and slug together', async () => {
		const { stub } = await mount()

		expect(stub.calls[0]?.operationName).toBe('ItemBySlug')
		expect(stub.calls[0]?.variables).toEqual({ companySlug: 'rivers-boutique', slug: 'leather-satchel' })
	})

	it('404s an item the resolver does not know', async () => {
		await mount('/shop/rivers-boutique/item/nowhere', null)

		expect(screen.getByRole('heading', { level: 1, name: 'This page does not exist' })).toBeInTheDocument()
	})

	/*
	 * ⚠️ The same 404, reached through the other shape a missing item arrives in. `runQuery` hands back
	 * whatever the envelope carried, so a reply with no `itemBySlug` key at all lands in the loader as
	 * `undefined` rather than as `null`. A guard that tests only one of the two renders the item page with
	 * no item in it — a heading built from `undefined.name`, which throws inside the render rather than
	 * 404ing the URL.
	 */
	it('404s an answer that carries no item at all', async () => {
		stubGraphQL({ ItemBySlug: { data: {} } })
		await renderRoute('/shop/rivers-boutique/item/leather-satchel')

		expect(screen.getByRole('heading', { level: 1, name: 'This page does not exist' })).toBeInTheDocument()
	})

	it('renders the item and credits the shop that sells it', async () => {
		await mount()

		expect(screen.getByRole('heading', { level: 1, name: 'Leather satchel' })).toBeInTheDocument()

		// Scoped: the shop is linked twice on this page, here and in the trail above it.
		const credit = screen.getByText(/Sold by/)

		expect(credit.textContent).toBe('Sold by Rivers Boutique')
		expect(within(credit).getByRole('link', { name: 'Rivers Boutique' })).toHaveAttribute('href', '/shop/rivers-boutique')
	})

	/*
	 * ⚠️ The shop the credit points at comes from the item, never from the URL. Requested here under a
	 * segment that is not the item's own shop, which is a shape the resolver does not produce today and the
	 * one a `<Link>` gets wrong for free: TanStack fills a `$param` it was not given from the *current*
	 * match, so dropping `params` entirely still renders a working-looking link — to whatever shop the
	 * visitor typed. Both links on the page are asserted, since only one of them is a `<Link>`.
	 */
	it('links the item’s own shop, not the one the URL names', async () => {
		await mount('/shop/whoever/item/leather-satchel')

		const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }))

		expect(within(screen.getByText(/Sold by/)).getByRole('link', { name: 'Rivers Boutique' })).toHaveAttribute(
			'href',
			'/shop/rivers-boutique'
		)
		expect(trail.getByRole('link', { name: 'Rivers Boutique' })).toHaveAttribute('href', '/shop/rivers-boutique')
	})

	it('renders the description a shop owner typed, line breaks and all', async () => {
		await mount('/shop/rivers-boutique/item/leather-satchel', itemOf({ description: 'Stitched by hand.\nTwo pockets.' }))

		expect(screen.getByText(/Stitched by hand/)).toHaveClass('whitespace-pre-line')
	})

	it('carries the full four-crumb trail', async () => {
		await mount()

		const trail = within(screen.getByRole('navigation', { name: 'Breadcrumb' }))

		expect(trail.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
		expect(trail.getByRole('link', { name: 'Shops' })).toHaveAttribute('href', '/shops')
		expect(trail.getByRole('link', { name: 'Rivers Boutique' })).toHaveAttribute('href', '/shop/rivers-boutique')
		expect(trail.queryByRole('link', { name: 'Leather satchel' })).not.toBeInTheDocument()
	})
})

describe('the item route head', () => {
	// An item name on its own ("Blue shirt", "Walnut table") is not a query anyone types; the pair is.
	it('names the shop beside the item in the title', () => {
		expect(titleOf(head(itemOf()))).toBe('Leather satchel — Rivers Boutique · Marketplace')
	})

	it('describes the item with its own text, and points the canonical at the nested URL', () => {
		expect(metaOf(head(itemOf()), 'description')).toBe('Stitched by hand.')
		expect(canonicalOf(head(itemOf()))).toBe('http://127.0.0.1:3045/shop/rivers-boutique/item/leather-satchel')
	})

	/*
	 * ⚠️ `Product` with **no `offers` block**, and that is correct rather than incomplete: `item` carries no
	 * price because cart and payment are out of scope. Marking up a price the page does not show is the one
	 * structured-data mistake that is a penalty rather than a miss, and it costs the whole domain its rich
	 * results, not just this page.
	 */
	it('declares the item as a Product, with no price it cannot show', () => {
		const product = jsonLdTyped(head(itemOf()), 'Product')

		expect(product).toEqual({
			'@context': 'https://schema.org',
			'@type': 'Product',
			name: 'Leather satchel',
			description: 'Stitched by hand.',
			url: 'http://127.0.0.1:3045/shop/rivers-boutique/item/leather-satchel',
			brand: { '@type': 'Organization', name: 'Rivers Boutique' }
		})
	})

	// The same four crumbs the page renders, in the same order — the two disagreeing is a manual action
	// against the domain rather than a warning on the page.
	it('mirrors the rendered trail in the structured data', () => {
		expect(jsonLdTyped(head(itemOf()), 'BreadcrumbList')?.itemListElement).toEqual([
			{ '@type': 'ListItem', position: 1, name: 'Home', item: 'http://127.0.0.1:3045/' },
			{ '@type': 'ListItem', position: 2, name: 'Shops', item: 'http://127.0.0.1:3045/shops' },
			{ '@type': 'ListItem', position: 3, name: 'Rivers Boutique', item: 'http://127.0.0.1:3045/shop/rivers-boutique' },
			{
				'@type': 'ListItem',
				position: 4,
				name: 'Leather satchel',
				item: 'http://127.0.0.1:3045/shop/rivers-boutique/item/leather-satchel'
			}
		])
	})

	// The placeholder describes nothing and points at the listing: it stands in for a page whose item is not
	// known yet, so both a description and a canonical of its own would describe the wrong page.
	it('emits a bare head, and no structured data, before the loader answers', () => {
		const empty = head(null)

		expect(titleOf(empty)).toBe('Item · Marketplace')
		expect(metaOf(empty, 'description')).toBe('')
		expect(canonicalOf(empty)).toBe('http://127.0.0.1:3045/shops')
		expect(jsonLdOf(empty)).toEqual([])
	})
})
