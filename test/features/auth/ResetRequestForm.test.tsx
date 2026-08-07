import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { ResetRequestForm } from '@/features/auth/ResetRequestForm'

import type { GraphQLReplies } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { CUSTOMER_EMAIL, renderWithClient } from '../../helpers/render'

const ACCEPTED: GraphQLReplies = { UserResetPwd: { data: { userResetPwd: true } } }

const mount = (replies: GraphQLReplies = ACCEPTED) => {
	const stub = stubGraphQL(replies)
	const result = renderWithClient(<ResetRequestForm />)

	return { ...result, stub, user: userEvent.setup() }
}

const ask = async (user: ReturnType<typeof userEvent.setup>, email = CUSTOMER_EMAIL) => {
	await user.type(screen.getByLabelText('Email'), email)
	await user.click(screen.getByRole('button', { name: 'Send reset link' }))
}

describe('ResetRequestForm', () => {
	it('asks for the address and nothing else', () => {
		mount()

		expect(screen.getAllByRole('textbox')).toHaveLength(1)
		expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username')
	})

	it('refuses an address that is not one', async () => {
		const { user, stub } = mount()

		await ask(user, 'not-an-address')

		expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	/*
	 * ⚠️ **`userResetPwd`, never `resetPwd`.** The public-resource service exposes both, they take the same
	 * arguments and both answer `true` for an address they cannot find — so sending the wrong one is
	 * indistinguishable from sending the right one for an unregistered address. They differ in the
	 * collection they search and in the domain the emailed link is built on, and a customer sent the
	 * shop-owner link lands on a panel that cannot complete their reset.
	 */
	it('sends the customer mutation, not the shop-owner one', async () => {
		const { user, stub } = mount()

		await ask(user)

		await waitFor(() => {
			expect(stub.calls).toHaveLength(1)
		})
		expect(stub.calls[0]?.operationName).toBe('UserResetPwd')
	})

	it('sends it to the public resource service', async () => {
		const { user, stub } = mount()

		await ask(user)

		await waitFor(() => {
			expect(stub.calls[0]?.url).toBe(ENDPOINT.publicResource)
		})
	})

	it('sends the address that was typed', async () => {
		const { user, stub } = mount()

		await ask(user)

		await waitFor(() => {
			expect(stub.calls[0]?.variables).toMatchObject({ email: CUSTOMER_EMAIL, turnstileToken: null })
		})
	})

	it('says what it is doing while it waits', async () => {
		const { user } = mount({ UserResetPwd: { pending: true } })

		await ask(user)

		expect(await screen.findByRole('button', { name: 'Sending…' })).toBeDisabled()
	})
})

describe('ResetRequestForm confirmation', () => {
	/*
	 * Deliberately vague, for the same reason the registration confirmation is: "if that address is
	 * registered" is the only phrasing that does not leak whether it is.
	 */
	it('does not say whether the address is registered', async () => {
		const { user } = mount()

		await ask(user)

		expect(await screen.findByRole('status')).toHaveTextContent('If that address is registered')
	})

	it('does not echo the address back', async () => {
		const { user } = mount()

		await ask(user)

		await screen.findByRole('status')
		expect(screen.queryByText(new RegExp(CUSTOMER_EMAIL))).not.toBeInTheDocument()
	})

	it('replaces the form', async () => {
		const { user } = mount()

		await ask(user)

		await screen.findByRole('status')
		expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
	})

	/*
	 * ⚠️ 60 minutes, and much sooner than the three-day activation link — the two are easy to confuse. An
	 * expired link fails with the same message as a wrong one, so the screen has to say "ask for a new one"
	 * rather than let somebody retry the old one and read the failure as a broken account.
	 */
	it('states the hour the link lasts', async () => {
		const { user } = mount()

		await ask(user)

		await screen.findByRole('status')
		// The duration is inside a `<strong>`, so the sentence around it is on the paragraph.
		expect(screen.getByText(/60 minutes/).closest('p')).toHaveTextContent('ask for a new link rather than retrying the old one')
	})
})

describe('ResetRequestForm on failure', () => {
	it('shows the message the server sent', async () => {
		const { user } = mount({ UserResetPwd: { errors: [graphQLError('Too many requests')], status: 429 } })

		await ask(user)

		expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests')
	})

	it('shows no confirmation the mail was sent', async () => {
		const { user } = mount({ UserResetPwd: { errors: [graphQLError('Too many requests')], status: 429 } })

		await ask(user)

		await screen.findByRole('alert')
		expect(screen.queryByRole('status')).not.toBeInTheDocument()
	})

	it('falls back to the generic message when the server is unreachable', async () => {
		const { user } = mount({ UserResetPwd: { networkError: 'ECONNREFUSED 127.0.0.1:4027' } })

		await ask(user)

		expect(await screen.findByRole('alert')).toHaveTextContent('Error while communicating with the server')
	})
})
