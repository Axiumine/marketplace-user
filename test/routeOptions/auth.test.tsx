import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { loginRouteOptions } from '@/routeOptions/login'
import { registerRouteOptions } from '@/routeOptions/register'
import { registerSellerRouteOptions } from '@/routeOptions/registerSeller'
import { resetPasswordRouteOptions } from '@/routeOptions/resetPassword'
import { resetPasswordConfirmRouteOptions } from '@/routeOptions/resetPasswordConfirm'

import type { GraphQLReplies } from '../helpers/graphql'
import { stubGraphQL } from '../helpers/graphql'
import type { RouteHead } from '../helpers/head'
import { canonicalOf, metaOf, titleOf } from '../helpers/head'
import { installOnlineListenerGuard } from '../helpers/onlineListenerGuard'
import { renderRoute } from '../helpers/render'

installOnlineListenerGuard()

const mount = async (path: string, replies: GraphQLReplies = {}) => {
	const stub = stubGraphQL(replies)

	return { ...(await renderRoute(path)), stub }
}

const headOf = (options: { head: () => unknown }): RouteHead => options.head() as RouteHead

/**
 * The emailed link, whole: a static path and the credential behind the `#`.
 *
 * ⚠️ **The `#` is what these tests are about.** `renderRoute` moves jsdom's location with
 * `history.replaceState`, so the fragment lands in `window.location.hash` exactly as a click on the mail
 * would leave it — and the router matches `/reset-password/confirm`, which is all a server would ever see
 * of it (RFC 3986 §3.5).
 */
const EMAILED_LINK = '/reset-password/confirm#/alice@example.com/9f3cabcd'

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

	/*
	 * ⚠️ The two registrations are two pages, and each has to send the other's audience away.
	 *
	 * `/register` writes a `user` and `/register/seller` writes a `shopOwner` — different collections,
	 * different service pairs, different apps, and nothing on the platform moves an account between them
	 * (ADR-002: the role *is* the collection). A seller who fills in the customer form does not get a
	 * fixable account, they get a customer account plus an address that can no longer be registered as a
	 * seller, and the only cure is a second address.
	 */
	it('offers the seller’s registration from the customer’s', async () => {
		await mount('/register')

		expect(within(screen.getByRole('main')).getByRole('link', { name: 'Apply for a shop-owner account' })).toHaveAttribute(
			'href',
			'/register/seller'
		)
		expect(sentenceAround('Apply for a shop-owner account')).toBe('Want to sell here instead? Apply for a shop-owner account.')
	})

	/*
	 * The seller's own page. The intro says what the form does *not* do, because "create an account" is what
	 * a seller expects it to do and is precisely what it does not: the shop, the company and the catalogue
	 * come afterwards, in another app, and only once an admin has cleared `waitApprov`.
	 */
	it('says an application is not yet a shop', async () => {
		await mount('/register/seller')

		expect(screen.getByRole('heading', { level: 1, name: 'Sell on Marketplace' })).toBeInTheDocument()
		expect(screen.getByText(/your shop, your company details and your catalogue come after we approve you/)).toBeInTheDocument()
		expect(sentenceAround('Create a customer account')).toBe('Buying rather than selling? Create a customer account.')
	})

	/*
	 * ⚠️ **No "sign in" link on the seller's page, and its absence is the assertion.** `/login` on this site
	 * authenticates against the `user` collection: a shop owner who followed it would be refused with the
	 * same message a wrong password gets, on the site that had just told them to register. The shop area is
	 * a separate app on an origin this one is not configured with, so the activation email is what carries
	 * the link to it.
	 */
	it('does not send a shop owner to the customer sign-in', async () => {
		await mount('/register/seller')

		const main = within(screen.getByRole('main'))

		expect(main.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
		expect(main.getByText(/Shop owners sign in through the link in their activation email/)).toBeInTheDocument()
	})

	it('renders the first half of password recovery', async () => {
		await mount('/reset-password')

		expect(screen.getByRole('heading', { level: 1, name: 'Reset your password' })).toBeInTheDocument()
		expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
		expect(sentenceAround('Sign in')).toBe('Remembered it? Sign in.')
	})

	/*
	 * ⚠️ Neither half of the credential is rendered. The pair *is* the credential — a page that echoed the
	 * address would put it on a screen anyone standing behind the customer can read, and one that echoed
	 * the hash would hand a live reset token to every browser extension and analytics script on the page.
	 */
	it('takes the emailed credential from the fragment without showing it', async () => {
		const { container } = await mount(EMAILED_LINK)

		expect(screen.getByRole('heading', { level: 1, name: 'Set a new password' })).toBeInTheDocument()
		expect(screen.getByLabelText('New password')).toBeInTheDocument()
		expect(container.textContent).not.toContain('alice@example.com')
		expect(container.textContent).not.toContain('9f3cabcd')
	})

	/*
	 * ⚠️ The whole point of the fragment, asserted end to end: the pair is read out of `location.hash` and
	 * reaches the mutation intact, having never been in a request line. A test of the parser alone would
	 * pass with a component that ignored what it returned.
	 */
	it('sends the address and the hash from the fragment to the mutation', async () => {
		const { stub } = await mount(EMAILED_LINK, { UserUpdatePwd: { data: { userUpdatePwd: true } } })
		const user = userEvent.setup()
		const password = 'a passphrase that is long enough'

		await user.type(screen.getByLabelText('New password'), password)
		await user.type(screen.getByLabelText('Repeat new password'), password)
		await user.click(screen.getByRole('button', { name: 'Set new password' }))

		await waitFor(() => {
			expect(stub.calls).toHaveLength(1)
		})
		expect(stub.calls[0]?.variables).toMatchObject({ email: 'alice@example.com', hash: '9f3cabcd', password })
	})

	/*
	 * ⚠️ Both failure branches of the fragment reader end in the same state a refused hash ends in: the
	 * explanation and a link to ask again, with no form to fill in. A page that rendered the form anyway
	 * would take a new password twice and then refuse it, which reads as "your password is wrong" rather
	 * than "this link is not whole".
	 *
	 * The two paths are a click that dropped everything after the `#`, and one that kept the address but
	 * lost the hash.
	 */
	it.each(['/reset-password/confirm', '/reset-password/confirm#/alice@example.com'])(
		'offers a new link instead of a form when the link arrives broken: %s',
		async (path) => {
			await mount(path)

			expect(screen.getByRole('alert')).toHaveTextContent('This reset link is incomplete — the part after the # is missing.')
			expect(screen.getByRole('link', { name: 'Ask for a new one' })).toHaveAttribute('href', '/reset-password')
			expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
		}
	)

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
		/*
		 * ⚠️ `noindex` on the seller's page is a choice against the obvious one. "Sell on Marketplace" is
		 * exactly the query a prospective shop owner types, and this is the page that answers it — but what
		 * is behind the form is an admin's approval queue, not a signup that completes itself, and a
		 * ranking application form fills that queue with whatever finds it. Sellers are recruited, and the
		 * page they are sent to is this one.
		 */
		[
			registerSellerRouteOptions,
			'Sell on Marketplace · Marketplace',
			'http://127.0.0.1:3045/register/seller',
			'Apply for a shop-owner account and start selling on Marketplace.'
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
	 * The canonical is the route's own path again. It was pinned to `/reset-password` while the credential
	 * was *in* the path, because `headFor` would otherwise have emitted
	 * `<link rel="canonical" href="…/reset-password/alice@example.com/9f3c…">` — the credential written into
	 * the page a second time and into anything that scrapes canonicals. The path is static now, so the
	 * honest canonical is safe, and `noIndex` stays for the reason it was always there: a password form
	 * that ranks is a password form bots find.
	 */
	it('names its own static path in the confirm page’s canonical', () => {
		const head = headOf(resetPasswordConfirmRouteOptions)

		expect(titleOf(head)).toBe('Set a new password · Marketplace')
		expect(canonicalOf(head)).toBe('http://127.0.0.1:3045/reset-password/confirm')
		expect(metaOf(head, 'robots')).toBe('noindex, follow')
		expect(metaOf(head, 'description')).toBe('Choose a new password for your account.')
	})
})

/*
 * ⚠️ **The one assertion no jsdom test can make for us.** Every test in this file renders in a browser,
 * where `ssr: false` changes nothing — the flag only ever matters on the server, and it is what stops this
 * route from being rendered into HTML and dehydrated into the page with a live credential in its match id.
 * Measured before it was set: the address and hash were in the body of a production response that also
 * carried `cache-control: public, s-maxage=60`.
 */
describe('the confirm route’s render mode', () => {
	it('is the only route outside the account area that renders client-side only', () => {
		expect(resetPasswordConfirmRouteOptions.ssr).toBe(false)
		expect(loginRouteOptions).not.toHaveProperty('ssr')
		expect(registerRouteOptions).not.toHaveProperty('ssr')
		expect(registerSellerRouteOptions).not.toHaveProperty('ssr')
		expect(resetPasswordRouteOptions).not.toHaveProperty('ssr')
	})
})
