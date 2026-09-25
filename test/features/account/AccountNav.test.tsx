import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { getAccessToken } from '@/api/tokenStore'
import { getSession } from '@/auth/session'
import { AccountNav } from '@/features/account/AccountNav'

import type { GraphQLReplies } from '../../helpers/graphql'
import { stubGraphQL } from '../../helpers/graphql'
import { stubLocationAssign } from '../../helpers/location'
import { installOnlineListenerGuard } from '../../helpers/onlineListenerGuard'
import { CUSTOMER_EMAIL, renderWithRouter } from '../../helpers/render'

installOnlineListenerGuard()

/** All signing out asks of the server. The exit itself is a page load, so home's loader never runs here. */
const REPLIES: GraphQLReplies = { Logout: { data: { logout: true } } }

/**
 * The location stub goes in *after* the render: `renderWithRouter` points jsdom's URL at `path` and then
 * lets the router read it, and a copy taken before that would freeze the router on the wrong page.
 */
const mount = async (path = '/account') => {
	const stub = stubGraphQL(REPLIES)
	const result = await renderWithRouter(<AccountNav />, { token: 'access-token', session: CUSTOMER_EMAIL, path })

	return { ...result, stub, assign: stubLocationAssign(), user: userEvent.setup() }
}

describe('AccountNav links', () => {
	it('links to the four account screens', async () => {
		await mount()

		expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/account')
		expect(screen.getByRole('link', { name: 'Addresses' })).toHaveAttribute('href', '/account/addresses')
		expect(screen.getByRole('link', { name: 'Password' })).toHaveAttribute('href', '/account/password')
		expect(screen.getByRole('link', { name: 'Close account' })).toHaveAttribute('href', '/account/close')
	})

	/*
	 * ⚠️ Closing an account is reached by a plain link, styled like its three neighbours. The screen behind
	 * it is where the consequences are stated and where the tick lives; a red tab here would make the
	 * *route* look like the destructive act, and somebody who only wants to read what closing does should be
	 * able to walk in and back out again.
	 */
	it('does not dress the close link as the destructive act', async () => {
		await mount()

		expect(screen.getByRole('link', { name: 'Close account' })).not.toHaveClass('bg-app-error')
	})

	it('is a labelled landmark of its own', async () => {
		await mount()

		expect(screen.getByRole('navigation', { name: 'Account' })).toBeInTheDocument()
	})

	/*
	 * `activeProps` rather than a manual `useMatch` comparison: the router sets `aria-current="page"` for
	 * us, and styling an active link without that attribute makes the current page visible to sighted
	 * visitors only.
	 */
	it('marks the current screen for a screen reader, not only in colour', async () => {
		await mount('/account/addresses')

		expect(screen.getByRole('link', { name: 'Addresses' })).toHaveAttribute('aria-current', 'page')
	})

	/*
	 * ⚠️ `activeOptions={{ exact: true }}` on the profile link is required, not cosmetic. `/account` is a
	 * prefix of every other route here, so without it the profile link renders as current while the
	 * customer is standing on the addresses page — two links claiming to be the current page, one lying.
	 */
	it('does not mark the profile link current on a sibling screen', async () => {
		await mount('/account/addresses')

		expect(screen.getByRole('link', { name: 'Profile' })).not.toHaveAttribute('aria-current')
	})

	it('marks the profile link current on the profile screen', async () => {
		await mount('/account')

		expect(screen.getByRole('link', { name: 'Profile' })).toHaveAttribute('aria-current', 'page')
	})

	/*
	 * ⚠️ All four links are checked, not only the first, and the *colours* are what is checked. Every one
	 * carries its own `activeProps`, and `aria-current` is the router's doing — it appears on the current
	 * link whatever `activeProps` holds. So a link that lost its active styling still satisfies the two
	 * tests above while rendering identically to its neighbours: four grey tabs, and nothing saying which
	 * screen the customer is on.
	 *
	 * The layout utilities are asserted alongside them because the active class repeats them rather than
	 * inheriting them. `Link` concatenates `className` with `activeProps.className` and the later one wins
	 * on a conflicting utility — but "concatenates" is behaviour of the router, not of the DOM, and
	 * spelling the box out keeps the padding if that merge ever became a replace. Asserting the box alone
	 * would prove nothing: it is on the inactive links too.
	 */
	it.each([
		['Profile', '/account'],
		['Addresses', '/account/addresses'],
		['Password', '/account/password'],
		['Close account', '/account/close']
	])('paints %s as the current screen while standing on it', async (name, path) => {
		await mount(path)

		const active = screen.getByRole('link', { name })

		expect(active).toHaveClass('bg-palette-bg', 'text-palette-white')
		expect(active).toHaveClass('rounded-box', 'px-3', 'py-2', 'text-sm')
	})

	it('leaves the other three links unpainted', async () => {
		await mount('/account/addresses')

		expect(screen.getByRole('link', { name: 'Profile' })).not.toHaveClass('bg-palette-bg')
		expect(screen.getByRole('link', { name: 'Password' })).not.toHaveClass('bg-palette-bg')
		expect(screen.getByRole('link', { name: 'Close account' })).not.toHaveClass('bg-palette-bg')
	})

	it('matches the snapshot', async () => {
		const { container } = await mount()

		expect(container.firstChild).toMatchSnapshot()
	})

	it('matches the snapshot on a sibling screen', async () => {
		const { container } = await mount('/account/addresses')

		expect(container.firstChild).toMatchSnapshot()
	})
})

describe('AccountNav sign out', () => {
	it('ends the session', async () => {
		const { user, stub } = await mount()

		await user.click(screen.getByRole('button', { name: 'Sign out' }))

		await waitFor(() => {
			expect(stub.calls.map((call) => call.operationName)).toContain('Logout')
		})
		expect(getAccessToken()).toBeNull()
		expect(getSession().signedIn).toBe(false)
	})

	// A full page load, not a router navigation: the urql client is a module singleton holding a document
	// cache, and `Me` takes no variables, so only a real load keeps the next customer to sign in on this
	// tab from being handed this one's account.
	it('leaves the private area', async () => {
		const { user, assign } = await mount()

		await user.click(screen.getByRole('button', { name: 'Sign out' }))

		await waitFor(() => {
			expect(assign).toHaveBeenCalledExactlyOnceWith('/')
		})
	})

	// A button and not a link: signing out is a state change, and a crawler that followed it would sign
	// out whoever it was crawling as.
	it('is a button, not a link', async () => {
		await mount()

		expect(screen.getByRole('button', { name: 'Sign out' })).toHaveAttribute('type', 'button')
	})

	/*
	 * ⚠️ `ml-auto` is asserted rather than left as decoration: it is the whole of what keeps sign-out at the
	 * far end of the bar. Flush against "Close account" — the arrangement the class is the only thing
	 * preventing — it is one mis-tap from the link beside it, and that link leads to the screen that ends
	 * the account rather than only the session.
	 *
	 * The rest of `LINK` comes with it, so sign-out is the same height as the four links it sits in a row
	 * with, and `underline` is what says it does something rather than being a label.
	 */
	it('sits apart from the links, and reads as an action', async () => {
		await mount()

		expect(screen.getByRole('button', { name: 'Sign out' })).toHaveClass('ml-auto', 'underline', 'px-3', 'py-2')
	})
})
