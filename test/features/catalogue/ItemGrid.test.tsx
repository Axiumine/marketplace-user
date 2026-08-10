import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ItemCardItem } from '@/features/catalogue/ItemCard'
import { ItemGrid } from '@/features/catalogue/ItemGrid'

import type { GraphQLReplies } from '../../helpers/graphql'
import { stubGraphQL } from '../../helpers/graphql'
import { renderWithRouter } from '../../helpers/render'

const HOME: GraphQLReplies = {
	Companies: { data: { companies: { nodes: [], total: 0 } } },
	ItemCategories: { data: { itemCategories: [] } }
}

const itemOf = (n: number): ItemCardItem => ({
	_id: `66c00000000000000000010${String(n)}`,
	name: `Satchel ${String(n)}`,
	description: 'Stitched by hand.',
	slug: `satchel-${String(n)}`,
	companySlug: 'rivers-boutique',
	companyPublicName: 'Rivers Boutique'
})

const mount = async (items: readonly ItemCardItem[]) => {
	stubGraphQL(HOME)

	return renderWithRouter(<ItemGrid items={items} />)
}

describe('ItemGrid', () => {
	it('is a list, with one item per catalogue entry', async () => {
		await mount([itemOf(1), itemOf(2), itemOf(3)])

		expect(screen.getByRole('list')).toBeInTheDocument()
		expect(screen.getAllByRole('listitem')).toHaveLength(3)
	})

	it('renders a card for each entry', async () => {
		await mount([itemOf(1), itemOf(2)])

		expect(screen.getByRole('heading', { name: 'Satchel 1' })).toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Satchel 2' })).toBeInTheDocument()
	})

	// Same division of labour as `ShopGrid`: the shop page, the category pages and the search results each
	// have their own wording for an empty result, so the grid renders nothing rather than guessing.
	it('renders an empty list rather than a message of its own', async () => {
		await mount([])

		expect(screen.getByRole('list')).toBeEmptyDOMElement()
	})

	it('matches the snapshot', async () => {
		const { container } = await mount([itemOf(1), itemOf(2)])

		expect(container.firstChild).toMatchSnapshot()
	})
})
