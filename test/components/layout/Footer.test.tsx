import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Footer } from '@/components/layout/Footer'
import { SITE_NAME } from '@/lib/seo'

import type { GraphQLReplies } from '../../helpers/graphql'
import { stubGraphQL } from '../../helpers/graphql'
import { renderWithRouter } from '../../helpers/render'

/** `renderWithRouter` loads the real route tree at `/`, and the home loader asks for these two. */
const HOME: GraphQLReplies = {
	Companies: { data: { companies: { nodes: [], total: 0 } } },
	ItemCategories: { data: { itemCategories: [] } }
}

const mount = async () => {
	stubGraphQL(HOME)

	return renderWithRouter(<Footer />)
}

const footerNav = () => within(screen.getByRole('navigation', { name: 'Footer' }))

describe('Footer navigation', () => {
	/*
	 * The links are asserted by `href` rather than by existence. `RouterContextProvider` resolves them
	 * against the real generated route tree, so a path that no route matches produces a wrong `href` here
	 * instead of a 404 nobody sees until production.
	 */
	it('links to the full shop listing', async () => {
		await mount()

		expect(footerNav().getByRole('link', { name: 'All shops' })).toHaveAttribute('href', '/shops')
	})

	it('links to registration', async () => {
		await mount()

		expect(footerNav().getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')
	})

	/*
	 * ⚠️ The seller's registration is a link of its own, and "Create an account" above is why it has to be.
	 * The two forms write different collections — `user` and `shopOwner` — and nothing on the platform moves
	 * an account between them (ADR-002: the role *is* the collection), so a shop owner who reads the generic
	 * label as theirs ends up with a customer account they cannot trade from and an address that can no
	 * longer be registered as a seller. This footer is the only nav every SSR page shares.
	 */
	it('links to the seller’s own registration, beside the customer’s', async () => {
		await mount()

		expect(footerNav().getByRole('link', { name: 'Sell on Marketplace' })).toHaveAttribute('href', '/register/seller')
	})

	it('links to sign in', async () => {
		await mount()

		expect(footerNav().getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
	})

	/*
	 * ⚠️ The privacy notice is reachable from here and only from here, which makes this assertion the one
	 * that keeps it reachable at all. It states the retention the edge configures, a visitor is
	 * logged on every request, and the footer is the single element the root route renders on every page —
	 * so a link removed here does not break a page, it quietly makes the statement unfindable.
	 */
	it('links to the privacy notice', async () => {
		await mount()

		expect(footerNav().getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
	})

	// The landmark is labelled because the header carries a second `<nav>`. Two unnamed navigation
	// landmarks in one document leave a screen-reader user choosing between "navigation" and "navigation".
	it('is a labelled landmark', async () => {
		await mount()

		expect(screen.getByRole('navigation', { name: 'Footer' })).toBeInTheDocument()
	})
})

describe('Footer attribution', () => {
	/*
	 * ⚠️ ODbL requires the credit, and MapLibre's in-canvas attribution control only exists once the island
	 * has hydrated. This line is in the server HTML, so the obligation is met on a page whose map never
	 * loads — which is every page for a visitor with JavaScript disabled.
	 */
	it('credits OpenStreetMap with a link to the licence', async () => {
		await mount()

		expect(screen.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute(
			'href',
			'https://www.openstreetmap.org/copyright'
		)
	})

	it('names the licence in the text', async () => {
		await mount()

		expect(screen.getByText(/ODbL/)).toBeInTheDocument()
	})

	/*
	 * The whole sentence, read the way a screen reader reads it — as one string, with the links inlined.
	 *
	 * The explicit `{' '}` separators either side of each anchor are the reason this is asserted rather than
	 * left to the per-link tests: JSX drops the whitespace around a line break, so without them the credit
	 * renders as `tiles byProtomaps.` — an attribution that still contains both names and still passes every
	 * assertion that looks for one of them, while being the one thing ODbL asks for and getting it wrong.
	 */
	it('reads as one sentence, with a space either side of each credited name', async () => {
		await mount()

		expect(screen.getByText(/ODbL/).textContent).toBe('Map data © OpenStreetMap contributors, ODbL. Basemap tiles by Protomaps.')
	})

	it('credits Protomaps for the basemap tiles', async () => {
		await mount()

		expect(screen.getByRole('link', { name: 'Protomaps' })).toHaveAttribute('href', 'https://protomaps.com')
	})

	// Both attribution links leave the site, and `rel="noreferrer"` keeps the referrer — which on a search
	// page carries the visitor's query string — out of the third party's logs.
	it('sends no referrer to either third party', async () => {
		await mount()

		expect(screen.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute('rel', 'noreferrer')
		expect(screen.getByRole('link', { name: 'Protomaps' })).toHaveAttribute('rel', 'noreferrer')
	})

	it('names the site', async () => {
		await mount()

		expect(screen.getByText(SITE_NAME)).toBeInTheDocument()
	})
})

describe('Footer snapshot', () => {
	it('renders', async () => {
		await mount()

		expect(screen.getByRole('contentinfo')).toMatchSnapshot()
	})
})
