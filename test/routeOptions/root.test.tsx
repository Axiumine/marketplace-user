import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { rootRouteOptions } from '@/routeOptions/root'

import { categoriesReply, companiesReply, companyOf } from '../helpers/catalogue'
import { stubGraphQL } from '../helpers/graphql'
import type { RouteHead } from '../helpers/head'
import { canonicalOf, linkOf, metaOf, propertyOf, titleOf } from '../helpers/head'
import { renderRoute } from '../helpers/render'

/*
 * ⚠️ The island is stubbed even though nothing here asserts on the map, and the reason is a real flake
 * rather than tidiness. `/` renders `MapIsland`, whose `lazy(() => import('./ShopMap'))` resolves on a
 * microtask this suite does not await: on an idle machine it lands after the test has finished and the
 * fallback is all that ever mounts, while on a loaded one — Stryker runs the whole suite in a single
 * worker beside 28 other processes — it lands *during* the test, MapLibre reaches for the WebGL context
 * jsdom does not have, and the teardown fails with `Cannot read properties of undefined (reading
 * 'destroy')` from inside the library.
 *
 * The failure was reported against whichever test happened to be running, which is why it read as a
 * problem with the shell. `MapIsland` and `ShopMap` have tests of their own; this file is about the
 * document.
 */
vi.mock('@/features/map/MapIsland', async () => {
	const { createElement } = await import('react')

	return { MapIsland: () => createElement('div', { 'data-testid': 'map' }) }
})

const mount = async () => {
	const stub = stubGraphQL({ Companies: companiesReply([companyOf()]), ItemCategories: categoriesReply() })
	const result = await renderRoute('/')

	return { ...result, stub }
}

const head = (): RouteHead => rootRouteOptions.head() as RouteHead

describe('the document shell', () => {
	/*
	 * ⚠️ `shellComponent` owns `<html>`, which is why the client entry hydrates `document` and not a `div` —
	 * there is no `index.html` in this repo. Everything React renders on the server starts here.
	 */
	it('renders the document itself, and claims Italian content', () => {
		const shell = rootRouteOptions.shellComponent({ children: null })

		expect(shell.type).toBe('html')
		// `lang` is a claim about the *content* — the shops, the addresses and the item descriptions are
		// Italian — not about the interface strings, which are English.
		expect(shell.props.lang).toBe('it')
	})

	// The skip link's target is the `<main>` the route renders into — a screen reader and a keyboard user
	// both land past the header with one activation.
	it('offers a skip link that points at the content landmark', async () => {
		await mount()

		expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main')
		expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
	})

	/*
	 * ⚠️ The urql provider is mounted from the **router context**, never from a module-level client.
	 * `getRouter()` runs once per request and puts a fresh client in the context; a shared one would hand
	 * one visitor's cached response to the next visitor the Node process is serving.
	 */
	it('serves the page from the client the router context carried', async () => {
		const { stub, router } = await mount()

		expect(stub.calls.length).toBeGreaterThan(0)
		expect(router.options.context.gql).toBeDefined()
	})

	it('wraps the route in the site chrome', async () => {
		await mount()

		expect(screen.getByRole('banner')).toBeInTheDocument()
		expect(screen.getByRole('contentinfo')).toBeInTheDocument()
	})
})

describe('the site-wide head', () => {
	/*
	 * ⚠️ `charSet` is first, ahead of anything that could carry a non-ASCII byte: a browser that meets one
	 * before the declaration has already guessed an encoding, and some restart the parse when corrected.
	 */
	it('declares the encoding before anything that could need it', () => {
		expect(head().meta[0]).toEqual({ charSet: 'utf-8' })
	})

	it('makes the page fit a phone', () => {
		expect(metaOf(head(), 'viewport')).toBe('width=device-width, initial-scale=1')
	})

	/*
	 * ⚠️ The stylesheet is a `link` in `head()` rather than a bare `import './styles.css'`, because that is
	 * what puts it in the **server's** HTML. A CSS import processed only by the client bundle arrives after
	 * hydration, and the first paint — the one Largest Contentful Paint measures — is unstyled.
	 */
	it('ships the stylesheet in the server HTML', () => {
		expect(linkOf(head(), 'stylesheet')).toBeDefined()
		expect(linkOf(head(), 'icon')).toBe('/favicon.ico')
	})

	/*
	 * A default every route overrides, so a route that sets no title still emits one. Only the *meta* half
	 * of `headFor` is spread here — the canonical stays with the route, because a site-wide one would point
	 * every page in the catalogue at the home page.
	 */
	it('carries a default title, and leaves the canonical to the route', () => {
		expect(titleOf(head())).toBe('Marketplace')
		expect(metaOf(head(), 'description')).toBe('Find shops near you and browse what they offer.')
		expect(canonicalOf(head())).toBeUndefined()
	})

	/*
	 * ⚠️ Dropping the canonical leaves `og:url` as the only thing the site-wide `path` still reaches, and it
	 * is a real tag with a real value: a share of a page whose route sets no head of its own is attributed
	 * to this URL. The trailing slash is asserted because it is the site root — `og:url` pointing at the
	 * bare origin is a different address, and social platforms key their counts on the string.
	 */
	it('defaults og:url to the site root', () => {
		expect(propertyOf(head(), 'og:url')).toBe('http://127.0.0.1:3045/')
	})
})
