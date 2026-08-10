import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ItemCardItem } from '@/features/catalogue/ItemCard'
import { ItemCard } from '@/features/catalogue/ItemCard'

import type { GraphQLReplies } from '../../helpers/graphql'
import { stubGraphQL } from '../../helpers/graphql'
import { renderWithRouter } from '../../helpers/render'

const HOME: GraphQLReplies = {
	Companies: { data: { companies: { nodes: [], total: 0 } } },
	ItemCategories: { data: { itemCategories: [] } }
}

const ITEM: ItemCardItem = {
	_id: '66c0000000000000000000d1',
	name: 'Leather satchel',
	description: 'Vegetable-tanned, stitched by hand.',
	slug: 'leather-satchel',
	companySlug: 'rivers-boutique',
	companyPublicName: 'Rivers Boutique'
}

const mount = async (item: ItemCardItem = ITEM) => {
	stubGraphQL(HOME)

	return renderWithRouter(<ItemCard item={item} />)
}

describe('ItemCard', () => {
	it('heads the card with the item name, at level two', async () => {
		await mount()

		expect(screen.getByRole('heading', { level: 2, name: 'Leather satchel' })).toBeInTheDocument()
	})

	// The item lives under its shop, and the URL says so: `/shop/:slug/item/:itemSlug`. An item slug is
	// unique per company, not globally, so the shop segment is what makes the address resolve at all.
	it('links to the item under its shop', async () => {
		await mount()

		expect(screen.getByRole('link')).toHaveAttribute('href', '/shop/rivers-boutique/item/leather-satchel')
	})

	/*
	 * ⚠️ The shop's name is text inside the same anchor, never a nested `<Link>` to the shop. An anchor
	 * inside an anchor is invalid HTML and browsers recover by closing the outer one early — which
	 * silently truncates the card's click target — and the shop page is one click away from the item page
	 * regardless.
	 */
	it('names the shop without linking to it', async () => {
		await mount()

		const links = screen.getAllByRole('link')

		expect(links).toHaveLength(1)
		expect(links[0]).toHaveTextContent('Rivers Boutique')
	})

	it('shows the description', async () => {
		await mount()

		expect(screen.getByText('Vegetable-tanned, stitched by hand.')).toBeInTheDocument()
	})

	// `item.description` is required by the collection validator, so there is no absent case here — only a
	// long one, cut at the same 120 characters the shop card uses so the two grids line up.
	it('truncates a long description', async () => {
		await mount({ ...ITEM, description: `${'word '.repeat(40)}end` })

		expect(screen.getByText(/…$/)).toBeInTheDocument()
		expect(screen.queryByText(/fine/)).not.toBeInTheDocument()
	})

	it('matches the snapshot', async () => {
		const { container } = await mount()

		expect(container.firstChild).toMatchSnapshot()
	})
})
