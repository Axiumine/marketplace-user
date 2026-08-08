import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CategoryNav } from '@/features/catalogue/CategoryNav'
import type { CategoryNode } from '@/lib/categories'

import type { GraphQLReplies } from '../../helpers/graphql'
import { stubGraphQL } from '../../helpers/graphql'
import { renderWithRouter } from '../../helpers/render'

/**
 * The loaders of every route this file stands on: `/` asks for shops and the tree, and a category route
 * asks for the tree and that category's items. The tree here is the flat shape the resolver answers with
 * — `nestCategories` builds the nodes below out of the same documents.
 */
const REPLIES: GraphQLReplies = {
	Companies: { data: { companies: { nodes: [], total: 0, totalIsExact: true, hasMore: false } } },
	Items: { data: { items: { nodes: [], total: 0, totalIsExact: true, hasMore: false } } },
	ItemCategories: {
		data: {
			itemCategories: [
				{ _id: 'cat-apparel', idParent: null, name: 'Apparel', slug: 'apparel', position: 1 },
				{ _id: 'cat-craft', idParent: null, name: 'Handmade', slug: 'handmade', position: 2 },
				{ _id: 'child-footwear', idParent: 'cat-apparel', name: 'Footwear', slug: 'footwear', position: 1 },
				{ _id: 'child-headwear', idParent: 'cat-apparel', name: 'Headwear', slug: 'headwear', position: 2 }
			]
		}
	}
}

const child = (name: string, slug: string, position: number): CategoryNode => ({
	_id: `child-${slug}`,
	name,
	slug,
	position,
	children: []
})

const APPAREL: CategoryNode = {
	_id: 'cat-apparel',
	name: 'Apparel',
	slug: 'apparel',
	position: 1,
	children: [child('Footwear', 'footwear', 1), child('Headwear', 'headwear', 2)]
}

const CRAFT: CategoryNode = {
	_id: 'cat-craft',
	name: 'Handmade',
	slug: 'handmade',
	position: 2,
	children: []
}

const mount = async (categories: readonly CategoryNode[], path = '/') => {
	stubGraphQL(REPLIES)

	return renderWithRouter(<CategoryNav categories={categories} />, { path })
}

describe('CategoryNav', () => {
	it('is a labelled landmark of its own', async () => {
		await mount([APPAREL, CRAFT])

		expect(screen.getByRole('navigation', { name: 'Categories' })).toBeInTheDocument()
	})

	it('links every top-level category', async () => {
		await mount([APPAREL, CRAFT])

		expect(screen.getByRole('link', { name: 'Apparel' })).toHaveAttribute('href', '/category/apparel')
		expect(screen.getByRole('link', { name: 'Handmade' })).toHaveAttribute('href', '/category/handmade')
	})

	/*
	 * ⚠️ Every subcategory is in the markup, not only the ones under an open parent. The tree is two levels
	 * deep and small, and rendering it whole is what makes every category page reachable from every other
	 * page — a crawler budgets how deep it will go, and a category three navigations away tends never to
	 * be visited.
	 */
	it('links every subcategory too, without waiting for a click', async () => {
		await mount([APPAREL, CRAFT])

		expect(screen.getByRole('link', { name: 'Footwear' })).toHaveAttribute('href', '/category/apparel/footwear')
		expect(screen.getByRole('link', { name: 'Headwear' })).toHaveAttribute('href', '/category/apparel/headwear')
	})

	// A child's URL carries its parent's slug, so the nesting is in the address and not only in the markup.
	it('nests a child under the parent it was given, not under its own slug', async () => {
		await mount([APPAREL])

		const parent = screen.getByRole('link', { name: 'Apparel' }).closest('li')

		expect(parent).not.toBeNull()
		expect(within(parent as HTMLElement).getAllByRole('link')).toHaveLength(3)
	})

	it('renders no child list for a category that has none', async () => {
		await mount([CRAFT])

		const parent = screen.getByRole('link', { name: 'Handmade' }).closest('li')

		expect(within(parent as HTMLElement).queryAllByRole('list')).toHaveLength(0)
	})

	/*
	 * `activeProps` rather than a `useMatch` comparison: the router marks the current link itself, and it
	 * is what keeps this component from having to know which route it is rendered on.
	 *
	 * ⚠️ The class is asserted alongside `aria-current`, because the two come from different places. The
	 * attribute is the router's own doing and survives an empty `activeProps` untouched; the weight is the
	 * only thing `activeProps` contributes, and it is what a sighted visitor actually sees. Asserting the
	 * attribute alone tests TanStack rather than this file.
	 */
	it('marks the category the visitor is standing on', async () => {
		await mount([APPAREL, CRAFT], '/category/handmade')

		const active = screen.getByRole('link', { name: 'Handmade' })

		expect(active).toHaveAttribute('aria-current', 'page')
		expect(active).toHaveClass('font-semibold')
		expect(screen.getByRole('link', { name: 'Apparel' })).not.toHaveAttribute('aria-current')
		expect(screen.getByRole('link', { name: 'Apparel' })).not.toHaveClass('font-semibold')
	})

	it('marks a subcategory the visitor is standing on', async () => {
		await mount([APPAREL], '/category/apparel/footwear')

		const active = screen.getByRole('link', { name: 'Footwear' })

		expect(active).toHaveAttribute('aria-current', 'page')
		expect(active).toHaveClass('font-semibold')
		expect(screen.getByRole('link', { name: 'Headwear' })).not.toHaveClass('font-semibold')
	})

	/*
	 * ⚠️ Nothing at all when there are no categories — not an empty bordered box with a heading over it.
	 * The category tree is admin-managed and can genuinely be empty on a new deployment, and a panel
	 * announcing "Categories" above nothing reads as a failed request.
	 */
	it('renders nothing when there are no categories', async () => {
		const { container } = await mount([])

		expect(container).toBeEmptyDOMElement()
		expect(screen.queryByRole('navigation', { name: 'Categories' })).not.toBeInTheDocument()
	})
})
