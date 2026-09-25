import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { privacyRouteOptions } from '@/routeOptions/privacy'

import { stubGraphQL } from '../helpers/graphql'
import type { RouteHead } from '../helpers/head'
import { canonicalOf, metaOf, titleOf } from '../helpers/head'
import { installOnlineListenerGuard } from '../helpers/onlineListenerGuard'
import { renderRoute } from '../helpers/render'

installOnlineListenerGuard()

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
	 * ⚠️ It scopes itself *in the text* to the two things that have code behind them, because the alternative
	 * failure of a notice is claiming a process nobody operates. Nothing has been decided about lawful basis,
	 * controller identity or an access request (`RISK_REGISTER` R25), so the page promises a later paragraph
	 * instead of inventing one.
	 *
	 * The list is still exactly two items after the account sections were added: those are prose, and this
	 * assertion is what keeps a third log file from being quietly listed beside the two the edge configures.
	 */
	it('scopes itself to the logs, to who can see an account and to closing one, and promises nothing else', async () => {
		await mount()

		expect(
			screen.getByText(
				'What the web server records about a visit to this site and for how long, who at this platform can see an account and what they can do to it, and what happens to an account when it is closed. This page covers those three things and nothing else; anything more will be added here when it has been decided, rather than described in advance.'
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
		expect(metaOf(head(), 'description')).toBe('What this site records about a visit and about an account, and for how long.')
	})
})

/*
 * ⚠️ Quotations again, and for a sharper reason than the log paragraphs: these sentences are the public
 * half of ADR-041 and ADR-046, and every number and every "not" in them is load-bearing. Thirty days is
 * `retentionSweep.mts`; three days is `PENDING_TTL_SECONDS`; "overwritten in place" is the option ADR-041
 * chose over deleting the row; "register again" rather than "log in" is the only door ADR-046 built. A
 * looser matcher would keep passing while the page drifted into describing a platform this is not, which on
 * a privacy notice is not a stale test but a false statement.
 */
describe('the privacy notice on an account', () => {
	// ADR-042: until the link is clicked there is no account, only a Redis key that expires on its own. It is
	// the one case where doing nothing is the complete answer, so the page says so rather than leaving a
	// reader to wonder what became of a form they abandoned.
	it('says an unconfirmed registration expires by itself and writes nothing', async () => {
		await mount()

		expect(screen.getByText(/Filling in the registration form/).textContent).toBe(
			'Filling in the registration form does not create an account. What it creates is a temporary record holding what you typed, and that record expires by itself after three days. If you never confirm the message we send you, nothing is ever written to the account database and there is nothing left to close: ignoring the mail is the whole of it.'
		)
	})

	// ADR-041's central sentence, said to the person it is about. "Does not remove it from the database" is
	// the whole difference between this platform and the one option A would have built.
	it('says a closed account is marked, not removed, and goes dark at once', async () => {
		await mount()

		expect(screen.getByText(/Closing an account —/).textContent).toBe(
			'Closing an account — your own, or one an admin closes — does not remove it from the database. It is marked as closed, every session it has open ends, and anything it had published goes off the marketplace at once. You cannot sign in with it from that moment.'
		)
	})

	/*
	 * ⚠️ The undo, and the assertion that it is described as a **re-registration**. `checkUserAuthorizationDisDel`
	 * refuses a closed account at the login gate on all three tiers, so a reader who understood this as "sign
	 * in again within thirty days" would meet the same generic refusal as somebody with no account at all and
	 * conclude the undo does not exist. The three riders are here too: unpublished, back into the approval
	 * queue, and a suspension that survives the round trip.
	 */
	it('says the account comes back by registering again, unpublished and still suspended if it was', async () => {
		await mount()

		expect(screen.getByText(/afterwards it can be brought back/).textContent).toBe(
			'For thirty days afterwards it can be brought back. Register again at the same email address and confirm the message we send you, and that same account returns — the same details, and for a seller the same shops and the same catalogue. What returns is unpublished, and a seller’s account goes back into the approval queue, so an admin approves it once more first. A suspension is not lifted by any of this: if an admin suspended the account, it comes back suspended, and only an admin can take that off.'
		)
	})

	// ADR-046's Negative consequence, in the notice rather than only in the ADR. Mailbox control alone
	// recovers the account, and the person it matters to — whose work address is reassigned inside the
	// window — will never read an ADR.
	it('says mailbox control alone is the whole check', async () => {
		await mount()

		expect(screen.getByText(/Confirming that message/).textContent).toBe(
			'Confirming that message is the whole of the check. Anyone able to read mail at the address during those thirty days can bring the account back and see what was in it, which is the same assumption a password reset makes — so if the address is one you are about to give up, closing the account is not the last step.'
		)
	})

	// "Overwritten in place", never "deleted": the row is permanent and the placeholders are what free the
	// address. A page that said the account is deleted on day 30 would be describing the option ADR-041
	// declined, and it is the one sentence a reader is most likely to quote back.
	it('says day thirty overwrites rather than deletes, and ends the undo', async () => {
		await mount()

		expect(screen.getByText(/After the thirty days/).textContent).toBe(
			'After the thirty days the personal details are overwritten in place: the email address is replaced by one that cannot receive mail, the name by Deleted User, the password by a value nobody holds. What is left is a record that an account existed, when it closed and at whose instruction — and from that point nothing brings it back, because there is nothing left to bring.'
		)
	})

	/*
	 * ⚠️ The refusal, stated as one. There is no erasure-on-request flow, no resolver behind one and no
	 * decision authorising one, so the page says there is none and points at what does exist. Inventing a
	 * queue here would be the exact failure the page's own scoping paragraph exists to prevent — and it is
	 * the sentence a reader arrives looking for, so leaving it out is not neutral either.
	 */
	it('says there is no separate erasure request, and what to do instead', async () => {
		await mount()

		expect(screen.getByText(/no separate/).textContent).toBe(
			'There is no separate “erase my data” request to make, and no queue one would go into. Closing the account starts the thirty days, and those thirty days are the shortest route there is.'
		)
	})

	/*
	 * ⚠️ Quotations once more, and the pair of them is the whole of what an admin sees of a customer
	 * (ADR-049): the admin's customers table lists every account's email address, and the two levers beside
	 * it end sessions and can close the account outright. The field list is asserted word for word because
	 * it is the disclosure — a matcher that only checked the paragraph existed would keep passing while a
	 * column was added to that table and never mentioned here, which is the one way this section can become
	 * false.
	 */
	it('says which of your fields an admin sees, and which are not on that screen', async () => {
		await mount()

		expect(screen.getByText(/Accounts are administered/).textContent).toBe(
			'Accounts are administered by people who work on this platform. They have one screen for it, and it lists every account: the email address you sign in with, the day you registered, whether you have confirmed that address, and whether the account is suspended together with the reason given for it. Your name and the addresses you save are not on that screen.'
		)
	})

	// The consequences a customer can observe — signed out, unable to return — rather than the mutation
	// names. The last clause is `deletedBy`: an account closed for you is indistinguishable from one you
	// closed yourself, so the notice is where a reader learns the platform knows which it was.
	it('says an admin can suspend or close the account, and that the record names them', async () => {
		await mount()

		expect(screen.getByText(/The same people can suspend/).textContent).toBe(
			'The same people can suspend an account and can close one. A suspension ends every session it has open at that moment and you cannot sign in again until an admin lifts it; the platform records which admin suspended it and the reason they gave. A closure works the same way and starts the thirty days described below, and what is recorded of it names the admin rather than you.'
		)
	})

	// The four headings a reader scans before reading a word of it.
	it('divides itself into the four things it covers', async () => {
		await mount()

		expect(
			within(screen.getByRole('main'))
				.getAllByRole('heading', { level: 2 })
				.map((heading) => heading.textContent)
		).toEqual([
			'The two log files',
			'A registration you have not confirmed',
			'Who at this platform can see your account',
			'Closing an account'
		])
	})
})

describe('the privacy notice snapshot', () => {
	it('renders', async () => {
		await mount()

		expect(screen.getByRole('main')).toMatchSnapshot()
	})
})
