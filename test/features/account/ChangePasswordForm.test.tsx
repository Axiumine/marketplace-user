import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { getAccessToken } from '@/api/tokenStore'
import { getSession } from '@/auth/session'
import { ChangePasswordForm } from '@/features/account/ChangePasswordForm'

import type { GraphQLReplies } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { CUSTOMER_EMAIL, renderWithClient } from '../../helpers/render'

const OLD = 'the old passphrase'
const NEW = 'a brand new passphrase'

const ACCEPTED: GraphQLReplies = { UserUpdatePwd: { data: { userUpdatePwd: true } } }

const mount = (replies: GraphQLReplies = ACCEPTED) => {
	const stub = stubGraphQL(replies)
	const result = renderWithClient(<ChangePasswordForm />, { token: 'access-token', session: CUSTOMER_EMAIL })

	return { ...result, stub, user: userEvent.setup() }
}

// The parameter is annotated because `repeat = next` reads a sibling default: TypeScript cannot infer a
// binding from an initializer that refers to another binding in the same pattern (TS7022).
const fillIn = async (
	user: ReturnType<typeof userEvent.setup>,
	{ old = OLD, next = NEW, repeat = next }: { old?: string; next?: string; repeat?: string } = {}
) => {
	await user.type(screen.getByLabelText('Current password'), old)
	await user.type(screen.getByLabelText('New password'), next)
	await user.type(screen.getByLabelText('Repeat new password'), repeat)
}

const submit = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(screen.getByRole('button', { name: 'Change password' }))
}

describe('ChangePasswordForm fields', () => {
	/*
	 * ⚠️ Requiring the current password is what makes it safe to keep the session alive afterwards:
	 * somebody holding a stolen access token cannot change the password without also knowing the old one.
	 */
	it('asks for the current password', () => {
		mount()

		expect(screen.getByLabelText('Current password')).toHaveAttribute('autocomplete', 'current-password')
	})

	it('asks for the new one twice', () => {
		mount()

		expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password')
		expect(screen.getByLabelText('Repeat new password')).toHaveAttribute('autocomplete', 'new-password')
	})

	// Length-checked with the same schema registration uses. Safe on a form only a signed-in customer can
	// reach — there is no account to enumerate, they already have one.
	it('states the same rule registration states', () => {
		mount()

		expect(screen.getByText(/At least 10 characters/)).toBeInTheDocument()
	})
})

describe('ChangePasswordForm validation', () => {
	it('refuses an empty current password', async () => {
		const { user, stub } = mount()

		await user.type(screen.getByLabelText('New password'), NEW)
		await user.type(screen.getByLabelText('Repeat new password'), NEW)
		await submit(user)

		expect(await screen.findByText('Enter your current password.')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	it('refuses a new password under the minimum', async () => {
		const { user, stub } = mount()

		await fillIn(user, { next: 'short' })
		await submit(user)

		expect(await screen.findByText('Use at least 10 characters.')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	it('refuses a confirmation that does not match', async () => {
		const { user, stub } = mount()

		await fillIn(user, { repeat: `${NEW} not` })
		await submit(user)

		expect(await screen.findByText('The two passwords do not match.')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})
})

describe('ChangePasswordForm submission', () => {
	/*
	 * ⚠️ `UserUpdatePwdDocument` from `operations/userResource/`, **not** the identically named one in
	 * `operations/publicResource/`. Two different mutations share that name across two services: the public
	 * one consumes an emailed reset hash, this one takes the current password. Importing the wrong module
	 * compiles and then fails at runtime on variables the other resolver has never heard of — the endpoint
	 * this lands on is the only visible difference.
	 */
	it('sends it to the user resource service, not the public one', async () => {
		const { user, stub } = mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(stub.calls).toHaveLength(1)
		})
		expect(stub.calls[0]?.url).toBe(ENDPOINT.userResource)
		expect(stub.calls[0]?.url).not.toBe(ENDPOINT.publicResource)
	})

	it('sends the old and the new password, and no hash', async () => {
		const { user, stub } = mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(stub.calls[0]?.variables).toEqual({ passwordOld: OLD, passwordNew: NEW })
		})
	})

	it('carries the access token', async () => {
		const { user, stub } = mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(stub.calls[0]?.authorization).toBe('Bearer access:access-token')
		})
	})

	it('says what it is doing while it waits', async () => {
		const { user } = mount({ UserUpdatePwd: { pending: true } })

		await fillIn(user)
		await submit(user)

		expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
	})
})

describe('ChangePasswordForm on success', () => {
	/*
	 * ⚠️ The tone is asserted through its colour, not through the role alone. `FormStatus` maps anything
	 * that is not `error` onto `role="status"`, so a confirmation that lost its tone still announces
	 * politely and still reads correctly to a screen reader — while rendering with no colour at all, which
	 * is the entire signal a sighted customer gets that the change went through rather than failed.
	 */
	it('confirms the change, in the colour of a success', async () => {
		const { user } = mount()

		await fillIn(user)
		await submit(user)

		const done = await screen.findByRole('status')

		expect(done).toHaveTextContent('Your password has been changed.')
		expect(done).toHaveClass('text-app-ok')
	})

	// Cleared on success only, so three password fields are not left sitting in the DOM of a page the
	// customer may walk away from.
	it('empties the fields', async () => {
		const { user } = mount()

		await fillIn(user)
		await submit(user)

		await screen.findByRole('status')
		expect(screen.getByLabelText('Current password')).toHaveValue('')
		expect(screen.getByLabelText('New password')).toHaveValue('')
		expect(screen.getByLabelText('Repeat new password')).toHaveValue('')
	})

	/*
	 * ⚠️ The session deliberately survives. Signing the customer out of the tab they are standing in, right
	 * after they did the responsible thing, teaches them not to do it again — and `passwordOld` is what
	 * makes keeping it safe. Other sessions do survive too; revoking those needs a server-side sweep the
	 * tier does not expose, so "sign out everywhere" is the follow-up rather than a silent side effect.
	 */
	it('keeps the customer signed in', async () => {
		const { user } = mount()

		await fillIn(user)
		await submit(user)

		await screen.findByRole('status')
		expect(getAccessToken()).toBe('access-token')
		expect(getSession().signedIn).toBe(true)
	})
})

describe('ChangePasswordForm on refusal', () => {
	it('shows the message the server sent', async () => {
		const { user } = mount({ UserUpdatePwd: { errors: [graphQLError('Wrong password')], status: 403 } })

		await fillIn(user)
		await submit(user)

		expect(await screen.findByRole('alert')).toHaveTextContent('Wrong password')
	})

	/*
	 * The fields keep what was typed. The likeliest cause is a mistyped *old* password, and retyping all
	 * three to fix one of them is punishment.
	 */
	it('keeps what was typed so one field can be corrected', async () => {
		const { user } = mount({ UserUpdatePwd: { errors: [graphQLError('Wrong password')], status: 403 } })

		await fillIn(user)
		await submit(user)

		await screen.findByRole('alert')
		expect(screen.getByLabelText('New password')).toHaveValue(NEW)
		expect(screen.getByLabelText('Repeat new password')).toHaveValue(NEW)
	})

	it('falls back to the generic message when the server is unreachable', async () => {
		const { user } = mount({ UserUpdatePwd: { networkError: 'ECONNREFUSED 127.0.0.1:4032' } })

		await fillIn(user)
		await submit(user)

		expect(await screen.findByRole('alert')).toHaveTextContent('Error while communicating with the server')
	})
})
