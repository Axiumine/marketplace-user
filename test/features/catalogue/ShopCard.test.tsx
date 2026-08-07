import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ShopCardCompany } from '@/features/catalogue/ShopCard'
import { ShopCard } from '@/features/catalogue/ShopCard'

import type { GraphQLReplies } from '../../helpers/graphql'
import { stubGraphQL } from '../../helpers/graphql'
import { renderWithRouter } from '../../helpers/render'

/** `renderWithRouter` loads the real route tree, and `/` has a loader. */
const HOME: GraphQLReplies = {
	Companies: { data: { companies: { nodes: [], total: 0 } } },
	ItemCategories: { data: { itemCategories: [] } }
}

const COMPANY: ShopCardCompany = {
	_id: '66c0000000000000000000b1',
	publicName: 'Bottega Rossi',
	slug: 'bottega-rossi',
	description: 'Handmade leather goods, repaired and sold since 1974.',
	address: { street: 'Via Roma 1', postalCode: '20121', city: 'Milano', province: 'MI' }
}

/** The fragment does not always select `description`, so the key is genuinely absent sometimes. */
const NO_DESCRIPTION: ShopCardCompany = {
	_id: COMPANY._id,
	publicName: COMPANY.publicName,
	slug: COMPANY.slug,
	address: COMPANY.address
}

const ONE_LINE = 'Via Roma 1, 20121 Milano (MI)'
const CARD_TEXT = `Bottega Rossi${ONE_LINE}`

const mount = async (company: ShopCardCompany = COMPANY, distanceMeters?: number | null) => {
	stubGraphQL(HOME)

	const props = distanceMeters === undefined ? {} : { distanceMeters }

	return renderWithRouter(<ShopCard company={company} {...props} />)
}

describe('ShopCard', () => {
	/*
	 * ⚠️ Fixed at `<h2>`. Every listing page has exactly one `<h1>` — the page title — and a card that
	 * chose its own level is how a page ends up with three of them. A screen reader jumps result to result
	 * by heading, so the level is the navigation, not decoration.
	 */
	it('heads the card with the shop name, at level two', async () => {
		await mount()

		expect(screen.getByRole('heading', { level: 2, name: 'Bottega Rossi' })).toBeInTheDocument()
	})

	/*
	 * ⚠️ The whole card is one anchor, with the shop's name as its text. That is a click-target decision on
	 * a phone, and a crawler one: a listing page's job is to pass its authority to the pages it links to,
	 * and one anchor per result carrying the name is what does that.
	 */
	it('is a single link to the shop page', async () => {
		await mount()

		const links = screen.getAllByRole('link')

		expect(links).toHaveLength(1)
		expect(links[0]).toHaveAttribute('href', '/shop/bottega-rossi')
	})

	it('writes the address on one line', async () => {
		await mount()

		expect(screen.getByText(ONE_LINE)).toBeInTheDocument()
	})

	it('shows the description', async () => {
		await mount()

		expect(screen.getByText(/Handmade leather goods/)).toBeInTheDocument()
	})

	// Cut at 120 characters on a word boundary, so one wordy shop cannot make its card twice the height of
	// its neighbours in a grid that has to line up.
	it('truncates a long description', async () => {
		await mount({ ...COMPANY, description: `${'parola '.repeat(40)}fine` })

		expect(screen.getByText(/…$/)).toBeInTheDocument()
		expect(screen.queryByText(/fine/)).not.toBeInTheDocument()
	})

	/*
	 * Two ways of saying "no description" that both reach this component: the field is nullable, and an
	 * owner can save an empty box. Neither may render an empty paragraph — a blank line in a grid card
	 * reads as a rendering failure.
	 *
	 * ⚠️ The paragraph is counted as well as read. An empty `<p>` contributes nothing to `textContent`, so
	 * a guard that let the empty string through would leave the card's text identical while adding a real
	 * element to the box — the extra line of `gap-2` that makes one card in a grid taller than its
	 * neighbours, which is the whole failure this branch exists to avoid.
	 */
	it.each([
		['null', null],
		['empty', '']
	])('renders no description paragraph when it is %s', async (_label, description) => {
		const { container } = await mount({ ...COMPANY, description })

		expect(screen.getByRole('link').textContent).toBe(CARD_TEXT)
		expect(container.querySelectorAll('p')).toHaveLength(1)
	})

	it('renders no description paragraph when the field was never selected', async () => {
		const { container } = await mount(NO_DESCRIPTION)

		expect(screen.getByRole('link').textContent).toBe(CARD_TEXT)
		expect(container.querySelectorAll('p')).toHaveLength(1)
	})
})

describe('ShopCard distance', () => {
	it('shows how far away the shop is', async () => {
		await mount(COMPANY, 1500)

		expect(screen.getByText('1,5 km away')).toBeInTheDocument()
	})

	it('shows metres under a kilometre', async () => {
		await mount(COMPANY, 850)

		expect(screen.getByText('850 m away')).toBeInTheDocument()
	})

	/*
	 * ⚠️ No distance is not zero distance. The bbox form of the nearby query computes no distance at all —
	 * only the radius form does — so a card rendering "0 m" for a missing value would be claiming the shop
	 * is where the customer is standing.
	 */
	it('says nothing when the distance is null', async () => {
		await mount(COMPANY, null)

		expect(screen.queryByText(/away/)).not.toBeInTheDocument()
	})

	it('says nothing when no distance was asked for', async () => {
		await mount()

		expect(screen.queryByText(/away/)).not.toBeInTheDocument()
	})
})
