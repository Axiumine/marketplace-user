import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ShopCardCompany } from '@/features/catalogue/ShopCard'
import { ShopGrid } from '@/features/catalogue/ShopGrid'

import type { GraphQLReplies } from '../../helpers/graphql'
import { stubGraphQL } from '../../helpers/graphql'
import { renderWithRouter } from '../../helpers/render'

const HOME: GraphQLReplies = {
	Companies: { data: { companies: { nodes: [], total: 0 } } },
	ItemCategories: { data: { itemCategories: [] } }
}

const companyOf = (n: number): ShopCardCompany => ({
	_id: `66c00000000000000000000${String(n)}`,
	publicName: `Boutique ${String(n)}`,
	slug: `boutique-${String(n)}`,
	description: null,
	address: { street: `Main Street ${String(n)}`, postalCode: '02108', city: 'Boston', province: 'MA' }
})

const mount = async (companies: readonly ShopCardCompany[]) => {
	stubGraphQL(HOME)

	return renderWithRouter(<ShopGrid companies={companies} />)
}

describe('ShopGrid', () => {
	/*
	 * A real `<ul>` and not a run of `<div>`s: a screen reader announces "list, 3 items" before the first
	 * card, which is the difference between knowing how many results there are and having to count them by
	 * arrowing to the end.
	 */
	it('is a list, with one item per shop', async () => {
		await mount([companyOf(1), companyOf(2), companyOf(3)])

		expect(screen.getByRole('list')).toBeInTheDocument()
		expect(screen.getAllByRole('listitem')).toHaveLength(3)
	})

	it('renders a card for each shop', async () => {
		await mount([companyOf(1), companyOf(2)])

		expect(screen.getByRole('heading', { name: 'Boutique 1' })).toBeInTheDocument()
		expect(screen.getByRole('heading', { name: 'Boutique 2' })).toBeInTheDocument()
	})

	/*
	 * ⚠️ Empty is the caller's problem, deliberately. Every page that lists shops has its own wording for
	 * "nothing here" — a city with no shops is not the same message as a search with no hits — so this
	 * renders an empty list rather than guessing, and each route pairs it with its own `EmptyState`.
	 */
	it('renders an empty list rather than a message of its own', async () => {
		await mount([])

		expect(screen.getByRole('list')).toBeEmptyDOMElement()
		expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
	})
})
