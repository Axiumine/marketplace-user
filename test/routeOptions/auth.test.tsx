import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { loginRouteOptions } from '@/routeOptions/login'
import { registerRouteOptions } from '@/routeOptions/register'
import { resetPasswordRouteOptions } from '@/routeOptions/resetPassword'
import { resetPasswordConfirmRouteOptions } from '@/routeOptions/resetPasswordConfirm'

import { stubGraphQL } from '../helpers/graphql'
import type { RouteHead } from '../helpers/head'
import { canonicalOf, metaOf, titleOf } from '../helpers/head'
import { renderRoute } from '../helpers/render'

const mount = async (path: string) => {
	const stub = stubGraphQL({})

	return { ...(await renderRoute(path)), stub }
}

const headOf = (options: { head: () => unknown }): RouteHead => options.head() as RouteHead

/*
 * The whole sentence a footer link sits in, read off the element that holds it.
 *
 * ⚠️ The space before the link is a `{' '}` expression of its own — JSX strips the whitespace around a
 * newline, so the separator has to be written explicitly and is a separate string in the source. Asserting
 * the link alone never reads it, and the page ships saying "No account yet?Create one."
 *
 * Scoped to `<main>`: the header links to `/login` from every page, so `Sign in` is ambiguous otherwise.
 */
const sentenceAround = (linkName: string): string =>
	within(screen.getByRole('main')).getByRole('link', { name: linkName }).parentElement?.textContent ?? ''

describe('the authentication pages', () => {
	it('renders the sign-in form, and offers registration beside it', async () => {
		await mount('/login')

		expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
		expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/register')
		expect(sentenceAround('Create one')).toBe('No account yet? Create one.')
	})

	// "Create an account" with two fields under it and no stated benefit is the highest-abandonment screen
	// in any funnel, so the page says what the account is *for* before asking for an address.
	it('says what an account is for before asking for one', async () => {
		await mount('/register')

		expect(screen.getByRole('heading', { level: 1, name: 'Create an account' })).toBeInTheDocument()
		expect(
			screen.getByText('Save your addresses once and reuse them. Email and a password is all it takes to start.')
		).toBeInTheDocument()
		// Scoped past the header, which links to `/login` from every page.
		expect(within(screen.getByRole('main')).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
		expect(sentenceAround('Sign in')).toBe('Already registered? Sign in.')
	})

	it('renders the first half of password recovery', async () => {
		await mount('/reset-password')

		expect(screen.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeInTheDocument()
		expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
		expect(sentenceAround('Sign in')).toBe('Remembered it? Sign in.')
	})

	/*
	 * ⚠️ Neither path parameter is rendered. The pair *is* the credential — a page that echoed the address
	 * would put it on a screen anyone standing behind the customer can read, and one that echoed the hash
	 * would hand a live reset token to every browser extension and analytics script on the page.
	 */
	it('takes the emailed credential from the URL without showing it', async () => {
		const { container } = await mount('/reset-password/alice%40example.com/9f3cabcd')

		expect(screen.getByRole('heading', { level: 1, name: 'Set a new password' })).toBeInTheDocument()
		expect(container.textContent).not.toContain('alice@example.com')
		expect(container.textContent).not.toContain('9f3cabcd')
	})

	// The header link, which is what a signed-out visitor actually clicks to get here.
	it('is reachable from the header', async () => {
		await mount('/login')

		expect(within(screen.getByRole('banner')).getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
	})
})

/*
 * ⚠️ Server-rendered *and* `noindex`, which is not a contradiction: SSR is about how fast the form paints,
 * `noindex` is about whether the URL belongs in an index. It does not — these pages rank for the brand name
 * and give a searcher nothing — and a registration form that ranks is a registration form bots find.
 *
 * `noindex, follow` rather than `nofollow`: the links out of here lead to pages that *are* meant to rank.
 */
describe('the authentication heads', () => {
	/*
	 * The description is asserted on a `noindex` page because it is not only a search-result snippet:
	 * `headFor` writes it into `og:description` and `twitter:description` too, and those are what a chat
	 * client renders when somebody pastes the link. An empty one shows the URL and nothing else.
	 */
	it.each([
		[
			loginRouteOptions,
			'Sign in · Marketplace',
			'http://127.0.0.1:3045/login',
			'Sign in to your account to manage your details and addresses.'
		],
		[
			registerRouteOptions,
			'Create an account · Marketplace',
			'http://127.0.0.1:3045/register',
			'Create an account to save your addresses and order faster.'
		],
		[
			resetPasswordRouteOptions,
			'Reset your password · Marketplace',
			'http://127.0.0.1:3045/reset-password',
			'Ask for a link to set a new password.'
		]
	])('titles and de-indexes %#', (options, title, canonical, description) => {
		const head = headOf(options)

		expect(titleOf(head)).toBe(title)
		expect(metaOf(head, 'robots')).toBe('noindex, follow')
		expect(canonicalOf(head)).toBe(canonical)
		expect(metaOf(head, 'description')).toBe(description)
	})

	/*
	 * ⚠️ The canonical is the *fixed* `/reset-password`, never the requested path. `headFor` would otherwise
	 * emit `<link rel="canonical" href="…/reset-password/alice@example.com/9f3c…">` — the credential written
	 * into the page a second time, and into anything that scrapes canonicals.
	 */
	it('keeps the credential out of the confirm page’s canonical', () => {
		const head = headOf(resetPasswordConfirmRouteOptions)

		expect(titleOf(head)).toBe('Set a new password · Marketplace')
		expect(canonicalOf(head)).toBe('http://127.0.0.1:3045/reset-password')
		expect(metaOf(head, 'robots')).toBe('noindex, follow')
		expect(metaOf(head, 'description')).toBe('Choose a new password for your account.')
	})
})
