import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { privacyRouteOptions } from '@/routeOptions/privacy'

import { stubGraphQL } from '../helpers/graphql'
import type { RouteHead } from '../helpers/head'
import { canonicalOf, metaOf, titleOf } from '../helpers/head'
import { renderRoute } from '../helpers/render'

const mount = async () => {
	stubGraphQL({})

	return renderRoute('/privacy')
}

const head = (): RouteHead => privacyRouteOptions.head() as RouteHead

/** The list that carries the two statements, read as the two sentences a visitor sees. */
const statements = (): string[] =>
	within(screen.getByRole('main'))
		.getAllByRole('listitem')
		.map((item) => item.textContent ?? '')

/*
 * ⚠️ These assertions are quotations, not descriptions, and that is the point of the story.
 *
 * The page is the public half of `marketplace-nginx/logrotate.d/nginx` in the parent workspace: `daily`,
 * `rotate 14`, `shred`. Asserting "the text mentions retention" would keep passing while the number drifted
 * away from the configuration, which is the one failure this page can have — a promise the edge does not
 * keep. Byte-for-byte is therefore deliberate: changing the period here fails the suite, which is the
 * prompt to check the configuration rather than the copy.
 */
describe('the privacy notice', () => {
	it('is a page a visitor can read, with a heading of its own', async () => {
		await mount()

		expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument()
	})

	it('states what the error log holds and for how long', async () => {
		await mount()

		expect(statements()[0]).toBe(
			'The web server’s error log records the network address a request came from, alongside the error itself. It is kept for 14 days.'
		)
	})

	it('states what the access log holds, for the same period, and that it holds no address', async () => {
		await mount()

		expect(statements()[1]).toBe(
			'Its access log records the URL that was requested, when, and how the server answered. It records no network address. It is kept for the same 14 days.'
		)
	})

	// `daily` + `rotate 14` keeps fourteen closed files beside the open one, so the last entry of the oldest
	// is destroyed on the fifteenth day. The page says so rather than rounding to the number in the config.
	it('says the files are shredded, and where the fourteen days end', async () => {
		await mount()

		expect(screen.getByText(/Both files are closed once a day/).textContent).toBe(
			'Both files are closed once a day and fourteen closed ones are kept, so no entry survives past the fifteenth day. When one falls out of that window it is shredded — its contents are overwritten before the file is removed — rather than only deleted.'
		)
	})

	/*
	 * ⚠️ It scopes itself to the logs *in the text*, because the alternative failure of a notice is claiming
	 * a process nobody operates. Nothing has been decided about lawful basis, access requests or any other
	 * retention (`RISK_REGISTER` R25), so the page promises a later paragraph instead of inventing one.
	 */
	it('scopes itself to those files and promises nothing else', async () => {
		await mount()

		expect(
			screen.getByText(
				'What the web server records about a visit to this site, and for how long it is kept. This page covers those log files and nothing else; anything more will be added here when it has been decided, rather than described in advance.'
			)
		).toBeInTheDocument()
		expect(statements()).toHaveLength(2)
	})

	// The page a data subject is meant to find is reachable from the chrome of every page, and the footer is
	// the only element the root route renders on all of them.
	it('is linked from the footer, on the page itself as on every other', async () => {
		await mount()

		expect(within(screen.getByRole('navigation', { name: 'Footer' })).getByRole('link', { name: 'Privacy' })).toHaveAttribute(
			'href',
			'/privacy'
		)
	})
})

describe('the privacy notice head', () => {
	it('titles and canonicalises itself', () => {
		expect(titleOf(head())).toBe('Privacy · Marketplace')
		expect(canonicalOf(head())).toBe('http://127.0.0.1:3045/privacy')
	})

	/*
	 * ⚠️ The absence of the tag is the acceptance criterion, not a side effect of copying another route.
	 * Every other non-catalogue page here is `noIndex: true` — the search results, all four authentication
	 * screens — so this one is a single word away from being the notice nobody can find, and nothing else in
	 * the suite would notice. `robots.txt` does not disallow it either (`src/routes/robots[.]txt.ts`).
	 */
	it('is indexable, which is the whole point of publishing it', () => {
		expect(metaOf(head(), 'robots')).toBeUndefined()
	})

	it('describes itself for a search result', () => {
		expect(metaOf(head(), 'description')).toBe('What this site records about a visit, and for how long.')
	})
})

describe('the privacy notice snapshot', () => {
	it('renders', async () => {
		await mount()

		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})
