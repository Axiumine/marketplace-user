import { act, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { clearSession, setSession } from '@/auth/session'
import { Header } from '@/components/layout/Header'
import { SITE_NAME } from '@/lib/seo'

import type { GraphQLReplies } from '../../helpers/graphql'
import { stubGraphQL } from '../../helpers/graphql'
import { CUSTOMER_EMAIL, renderWithRouter } from '../../helpers/render'

const HOME: GraphQLReplies = {
	Companies: { data: { companies: { nodes: [], total: 0 } } },
	ItemCategories: { data: { itemCategories: [] } }
}

const mount = async (session: string | null = null) => {
	stubGraphQL(HOME)

	return renderWithRouter(<Header />, session === null ? {} : { session })
}

const mainNav = () => within(screen.getByRole('navigation', { name: 'Main' }))

describe('Header chrome', () => {
	it('links the brand back to the home page', async () => {
		await mount()

		expect(screen.getByRole('link', { name: SITE_NAME })).toHaveAttribute('href', '/')
	})

	// The search field is part of the header rather than of each listing page, so a visitor who landed on
	// a shop page from a search engine can search again without going back to the home page first.
	it('carries the site search', async () => {
		await mount()

		expect(screen.getByRole('search')).toBeInTheDocument()
	})

	it('links to the shop listing whoever is looking', async () => {
		await mount()

		expect(mainNav().getByRole('link', { name: 'Shops' })).toHaveAttribute('href', '/shops')
	})

	// Labelled, because the footer carries a second `<nav>` — see `Footer.test.tsx`.
	it('is a labelled landmark', async () => {
		await mount()

		expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
	})
})

describe('Header session link', () => {
	it('offers sign in to a visitor', async () => {
		await mount()

		expect(mainNav().getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
	})

	it('offers the account area to a signed-in customer', async () => {
		await mount(CUSTOMER_EMAIL)

		expect(mainNav().getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/account')
	})

	it('shows one of the two and never both', async () => {
		await mount(CUSTOMER_EMAIL)

		expect(mainNav().queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
	})

	/*
	 * ⚠️ This is the whole reason `getServerSession` is a frozen constant. The header is the only piece of
	 * chrome whose content depends on who is looking, and the public pages behind it are held in a shared
	 * `proxy_cache`. Signing in swaps the link *after* hydration — a flash of the wrong link for one frame,
	 * against the alternative of server-rendering per-visitor markup into a cache every visitor reads.
	 */
	it('swaps the link when the session store changes under it', async () => {
		await mount()

		act(() => {
			setSession(CUSTOMER_EMAIL)
		})

		expect(mainNav().getByRole('link', { name: 'Account' })).toBeInTheDocument()
	})

	it('swaps it back when the session ends', async () => {
		await mount(CUSTOMER_EMAIL)

		act(() => {
			clearSession()
		})

		expect(mainNav().getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
	})

	// It is not an authorisation boundary. The account routes guard themselves, and this link being wrong
	// for a frame costs a redirect, not a leak.
	it('renders the account link as an ordinary link, not a guard', async () => {
		await mount(CUSTOMER_EMAIL)

		expect(mainNav().getByRole('link', { name: 'Account' })).toBeVisible()
	})
})

describe('Header snapshot', () => {
	it('renders signed out', async () => {
		await mount()

		expect(screen.getByRole('banner')).toMatchSnapshot()
	})

	it('renders signed in', async () => {
		await mount(CUSTOMER_EMAIL)

		expect(screen.getByRole('banner')).toMatchSnapshot()
	})
})
