import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { accountRouteOptions } from '@/routeOptions/account'
import { accountAddressesRouteOptions } from '@/routeOptions/accountAddresses'
import { accountPasswordRouteOptions } from '@/routeOptions/accountPassword'
import { accountProfileRouteOptions } from '@/routeOptions/accountProfile'

import { stubGraphQL } from '../helpers/graphql'
import type { RouteHead } from '../helpers/head'
import { canonicalOf, metaOf, titleOf } from '../helpers/head'
import { meReply } from '../helpers/me'
import { renderRoute } from '../helpers/render'

const mount = async (path: string) => {
	const stub = stubGraphQL(meReply())
	const result = await renderRoute(path, { token: 'access-token', session: 'customer@marketplace.it' })

	return { ...result, stub }
}

describe('the account layout', () => {
	/*
	 * ⚠️ `ssr: false` lives here and nowhere else, which is why the private area is one subtree rather than
	 * three sibling routes — the flag is inherited. Server-rendering a page that holds one customer's name
	 * and addresses puts it one misconfigured `Vary` away from being served to the next visitor out of the
	 * shared nginx cache. A shell with no data in it cannot leak anything, whatever the cache does.
	 */
	it('never renders on the server', () => {
		expect(accountRouteOptions.ssr).toBe(false)
	})

	it('renders the heading and the navigation for the whole subtree', async () => {
		await mount('/account')

		expect(screen.getByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument()

		const nav = within(screen.getByRole('navigation', { name: 'Account' }))

		expect(nav.getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/account')
		expect(nav.getByRole('link', { name: 'Addresses' })).toHaveAttribute('href', '/account/addresses')
		expect(nav.getByRole('link', { name: 'Password' })).toHaveAttribute('href', '/account/password')
		expect(nav.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
	})

	/*
	 * ⚠️ The gate is *inside* the layout, not around it: the heading and the navigation render while `me` is
	 * still in flight, so the page has a shape from the first frame. It also keeps sign-out reachable when
	 * `me` is failing, which is exactly the state a customer needs it in.
	 */
	it('keeps the navigation up while the account is still loading', async () => {
		stubGraphQL({ Me: { pending: true } })
		await renderRoute('/account', { token: 'access-token', session: 'customer@marketplace.it' })

		expect(screen.getByRole('navigation', { name: 'Account' })).toBeInTheDocument()
		expect(screen.getByRole('status')).toHaveTextContent('Loading your account…')
	})

	it('asks for the account once, for the whole subtree', async () => {
		const { stub } = await mount('/account/addresses')

		expect(stub.calls.map((call) => call.operationName)).toEqual(['Me'])
	})
})

/*
 * ⚠️ `findByRole`, not `getByRole`, for anything past the layout's gate. `renderRoute` waits for the
 * router to go idle, and the router knows nothing about the `Me` query — these screens render behind
 * `AccountGate`, so they appear a urql tick after the route does. `getByRole` passes on an unloaded
 * machine and fails on a loaded one, which is the worst kind of assertion to own.
 */
describe('the account screens', () => {
	it('opens on the profile', async () => {
		await mount('/account')

		const section = within(await screen.findByRole('region', { name: 'Your details' }))

		expect(section.getByRole('heading', { level: 2, name: 'Your details' })).toBeInTheDocument()
		expect(section.getByDisplayValue('Julia')).toBeInTheDocument()
	})

	it('renders the address book', async () => {
		await mount('/account/addresses')

		expect(await screen.findByRole('region', { name: 'Your addresses' })).toBeInTheDocument()
		expect(screen.getByText('Save as many as you like and mark one as the default.')).toBeInTheDocument()
	})

	it('renders the password screen, and says what changing it does not do', async () => {
		await mount('/account/password')

		const section = within(await screen.findByRole('region', { name: 'Password' }))

		expect(section.getByRole('heading', { level: 2, name: 'Password' })).toBeInTheDocument()
		expect(
			section.getByText('Changing it here keeps you signed in on this device. Other devices stay signed in too.')
		).toBeInTheDocument()
	})

	/*
	 * ⚠️ None of the three defines a head. TanStack Router *merges* heads along the matched chain rather than
	 * replacing them, so a child repeating the layout's head would give one page two `<title>` tags. The only
	 * reason to define one here would be to change the title, and "Your account" is right for all three.
	 */
	it.each([
		[accountProfileRouteOptions, 'the profile screen'],
		[accountAddressesRouteOptions, 'the address book'],
		[accountPasswordRouteOptions, 'the password screen']
	])('leaves the head to the layout: %#, %s', (options) => {
		expect(options).not.toHaveProperty('head')
	})
})

describe('the account head', () => {
	/*
	 * ⚠️ `noIndex` on top of `ssr: false`, because the flag is not a robots directive: the shell still comes
	 * back as HTML at a real URL, and a crawler that ran the JavaScript would find a login redirect rather
	 * than an error. `robots.txt` disallows the prefix too — the two mechanisms fail in different ways.
	 */
	it('keeps the private area out of the index', () => {
		const head = accountRouteOptions.head() as RouteHead

		expect(titleOf(head)).toBe('Your account · Marketplace')
		expect(metaOf(head, 'robots')).toBe('noindex, follow')
		expect(canonicalOf(head)).toBe('http://127.0.0.1:3045/account')
		// Not a snippet — the page is out of the index either way — but `headFor` writes it into
		// `og:description` as well, which is what a chat client shows for a pasted link.
		expect(metaOf(head, 'description')).toBe('Manage your details and delivery addresses.')
	})
})
