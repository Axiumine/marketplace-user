import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { getAccessToken } from '@/api/tokenStore'
import { getSession } from '@/auth/session'
import { CLOSE_REFUSED, CloseAccount, CONFIRM_LABEL } from '@/features/account/CloseAccount'

import type { GraphQLReplies } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { meReply } from '../../helpers/me'
import { CUSTOMER_EMAIL, renderRoute, renderWithRouter } from '../../helpers/render'

/**
 * The mutation answers, plus what signing out costs: `useLogout` sends `Logout` and then lands on `/`,
 * whose loader asks for these two. All four are stubbed everywhere, because an operation nobody
 * configured throws — which is the point of the double, and would otherwise fail the success tests for a
 * reason that has nothing to do with closing an account.
 */
const AFTER: GraphQLReplies = {
	Logout: { data: { logout: true } },
	Companies: { data: { companies: { nodes: [], total: 0 } } },
	ItemCategories: { data: { itemCategories: [] } }
}

const ACCEPTED: GraphQLReplies = { ...AFTER, UserDel: { data: { userDel: true } } }

const mount = async (replies: GraphQLReplies = ACCEPTED) => {
	const stub = stubGraphQL(replies)
	const result = await renderWithRouter(<CloseAccount />, {
		token: 'access-token',
		session: CUSTOMER_EMAIL,
		path: '/account/close'
	})

	return { ...result, stub, user: userEvent.setup() }
}

const button = () => screen.getByRole('button', { name: 'Close my account' })

const confirmAndPress = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(screen.getByLabelText(CONFIRM_LABEL))
	await user.click(button())
}

describe('CloseAccount copy', () => {
	/*
	 * ⚠️ The consequences are asserted through the copy rather than paraphrased, because the copy is the
	 * only warning a customer gets before an action that ends every session they have. A test asserting
	 * "some text is present" would pass on a screen that had quietly lost the sentence that matters.
	 */
	it('says the sessions end and the account stops working', async () => {
		await mount()

		expect(screen.getByText(/every session you have open/)).toBeInTheDocument()
		expect(screen.getByText(/you cannot sign in with it again from that moment/)).toBeInTheDocument()
	})

	// ADR-046. The undo is a re-registration at the same address, not a login — a customer who read it as
	// "sign in again within thirty days" would meet the same refusal as somebody with no account at all.
	it('states the thirty-day undo, and that it is a registration', async () => {
		await mount()

		// Exact, not a regex: `thirty days` appears in the overwrite paragraph as well, and only the
		// emphasised span in the undo paragraph has it as its whole text.
		expect(screen.getByText('thirty days')).toBeInTheDocument()
		expect(screen.getByText(/Register again at this same email address/)).toBeInTheDocument()
	})

	/*
	 * ⚠️ ADR-044 and ADR-046 together: a restore leaves `disabled`, `disabledBy` and `disabledReason`
	 * exactly as it found them, so closing and re-registering is not a way out of a suspension. Said on the
	 * screen because it is the one consequence a suspended customer may believe they are buying.
	 */
	it('refuses to let closing read as a way out of a suspension', async () => {
		await mount()

		expect(screen.getByText(/A suspension is not lifted by closing your account/)).toBeInTheDocument()
	})

	/*
	 * ⚠️ ADR-041 said to the person it is about, and the same sentence `/privacy` makes publicly: the
	 * document is never removed, the personal fields are overwritten at day 30. Promising a deletion here
	 * would be a promise the sweeper cannot keep, and the two pages would then disagree.
	 */
	it('promises an overwrite rather than a deletion, and points at the notice', async () => {
		await mount()

		expect(screen.getByText(/your personal details are overwritten/)).toBeInTheDocument()
		expect(screen.getByText(/The record that an account existed and when it closed is kept/)).toBeInTheDocument()
		expect(screen.getByRole('link', { name: 'privacy page' })).toHaveAttribute('href', '/privacy')
	})

	it('matches the snapshot', async () => {
		const { container } = await mount()

		expect(container.firstChild).toMatchSnapshot()
	})
})

describe('CloseAccount confirmation', () => {
	it('starts with the box unticked and the button dead', async () => {
		await mount()

		expect(screen.getByLabelText(CONFIRM_LABEL)).not.toBeChecked()
		expect(button()).toBeDisabled()
	})

	it('arms the button once the box is ticked', async () => {
		const { user } = await mount()

		await user.click(screen.getByLabelText(CONFIRM_LABEL))

		expect(button()).toBeEnabled()
	})

	// The tick is a toggle, not a latch. A customer who ticked the box while reading and then thought
	// better of it must be able to put the gate back, rather than being one stray press from a closed
	// account for the rest of the visit.
	it('disarms it again when the box is unticked', async () => {
		const { user } = await mount()

		await user.click(screen.getByLabelText(CONFIRM_LABEL))
		await user.click(screen.getByLabelText(CONFIRM_LABEL))

		expect(screen.getByLabelText(CONFIRM_LABEL)).not.toBeChecked()
		expect(button()).toBeDisabled()
	})

	it('sends nothing while the box is unticked', async () => {
		const { user, stub } = await mount()

		await user.click(button())

		expect(stub.calls).toHaveLength(0)
	})
})

describe('CloseAccount request', () => {
	/*
	 * ⚠️ **No variables, and the absence is the security property.** The account closed is the one the Redis
	 * session behind the access token names; an `_id` accepted from a browser would make this "close any
	 * customer's account". The assertion is `toEqual({})` rather than a check on one key, because the whole
	 * point is that there is nothing in there.
	 */
	it('asks for no account in particular', async () => {
		const { user, stub } = await mount()

		await confirmAndPress(user)

		await waitFor(() => {
			expect(stub.calls[0]?.operationName).toBe('UserDel')
		})
		expect(stub.calls[0]?.variables).toEqual({})
	})

	it('sends it to the user resource service, not the public one', async () => {
		const { user, stub } = await mount()

		await confirmAndPress(user)

		await waitFor(() => {
			expect(stub.calls[0]?.url).toBe(ENDPOINT.userResource)
		})
		expect(stub.calls[0]?.url).not.toBe(ENDPOINT.publicResource)
	})

	it('carries the access token', async () => {
		const { user, stub } = await mount()

		await confirmAndPress(user)

		await waitFor(() => {
			expect(stub.calls[0]?.authorization).toBe('Bearer access:access-token')
		})
	})

	it('says what it is doing while it waits, and cannot be pressed twice', async () => {
		const { user } = await mount({ ...AFTER, UserDel: { pending: true } })

		await confirmAndPress(user)

		const busy = await screen.findByRole('button', { name: 'Closing…' })

		expect(busy).toBeDisabled()
		expect(busy).toHaveAttribute('aria-busy', 'true')
	})

	it('is not busy before it is pressed', async () => {
		await mount()

		expect(button()).toHaveAttribute('aria-busy', 'false')
	})
})

describe('CloseAccount on success', () => {
	it('ends the session locally as well as on the server', async () => {
		const { user, stub } = await mount()

		await confirmAndPress(user)

		await waitFor(() => {
			expect(stub.calls.map((call) => call.operationName)).toContain('Logout')
		})
		expect(getAccessToken()).toBeNull()
		expect(getSession().signedIn).toBe(false)
	})

	// Home rather than the login page: this app has a public site to fall back to, and somebody who has
	// just closed their account is not a visitor to send to a sign-in form.
	it('leaves the private area', async () => {
		const { user, router } = await mount()

		await confirmAndPress(user)

		await waitFor(() => {
			expect(router.state.location.pathname).toBe('/')
		})
	})

	/*
	 * ⚠️ The order is the mutation and then the sign-out, and it is asserted rather than assumed. Signing
	 * out first would drop the access token this request is authenticated with, and the close would be
	 * refused with the customer already looking at the public home page — believing they had closed an
	 * account that is still open.
	 */
	it('closes the account before it signs out', async () => {
		const { user, stub } = await mount()

		await confirmAndPress(user)

		await waitFor(() => {
			expect(stub.calls.map((call) => call.operationName)).toContain('Logout')
		})
		expect(stub.calls.map((call) => call.operationName).slice(0, 2)).toEqual(['UserDel', 'Logout'])
	})

	/*
	 * ⚠️ **`CTX_USER_RESOURCE`, not `CTX_ACCOUNT_WRITE`** — the one write on this tier sent without
	 * `additionalTypenames: ['GraphQLUserMe']`. Adding it would make `AccountGate` re-read an account that
	 * no longer answers, racing the sign-out for a 401 nobody reads. Asserted through the whole route, since
	 * the gate is the only thing that would issue the second `Me`.
	 */
	it('does not send the account query looking for an account it just closed', async () => {
		const stub = stubGraphQL({ ...ACCEPTED, ...meReply() })
		const user = userEvent.setup()
		await renderRoute('/account/close', { token: 'access-token', session: CUSTOMER_EMAIL })

		await screen.findByRole('button', { name: 'Close my account' })
		await confirmAndPress(user)

		await waitFor(() => {
			expect(stub.calls.map((call) => call.operationName)).toContain('Logout')
		})
		expect(stub.calls.filter((call) => call.operationName === 'Me')).toHaveLength(1)
	})
})

describe('CloseAccount on refusal', () => {
	it('shows the message the server sent', async () => {
		const { user } = await mount({ ...AFTER, UserDel: { errors: [graphQLError('Account already closed')], status: 410 } })

		await confirmAndPress(user)

		expect(await screen.findByRole('alert')).toHaveTextContent('Account already closed')
	})

	// A `false` with no error is a shape the schema allows and the resolver does not produce. It still gets
	// a sentence: an unchanged screen after a press is indistinguishable from a press that did not register.
	it('says so when the server answers false without an error', async () => {
		const { user } = await mount({ ...AFTER, UserDel: { data: { userDel: false } } })

		await confirmAndPress(user)

		expect(await screen.findByRole('alert')).toHaveTextContent(CLOSE_REFUSED)
	})

	/*
	 * ⚠️ `{"data": null}` carries no error to quote, which is why `dataOf` is read before the value. Treating
	 * this envelope as a success would sign somebody out and leave them looking at the public home page with
	 * an account that is still open and no way to know it.
	 */
	it('says the same when the answer carries no data at all', async () => {
		const { user } = await mount({ ...AFTER, UserDel: { data: null } })

		await confirmAndPress(user)

		expect(await screen.findByRole('alert')).toHaveTextContent(CLOSE_REFUSED)
	})

	it('falls back to the generic message when the server is unreachable', async () => {
		const { user } = await mount({ ...AFTER, UserDel: { networkError: 'ECONNREFUSED 127.0.0.1:4032' } })

		await confirmAndPress(user)

		expect(await screen.findByRole('alert')).toHaveTextContent('Error while communicating with the server')
	})

	// The session survives a refusal, and so does the screen: the customer is still signed in, still on the
	// page, and can read what went wrong and press again.
	it('keeps the customer signed in', async () => {
		const { user, stub } = await mount({ ...AFTER, UserDel: { data: { userDel: false } } })

		await confirmAndPress(user)

		await screen.findByRole('alert')
		expect(stub.calls.map((call) => call.operationName)).not.toContain('Logout')
		expect(getAccessToken()).toBe('access-token')
		expect(getSession().signedIn).toBe(true)
	})
})
