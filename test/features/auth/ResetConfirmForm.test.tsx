import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { ResetConfirmForm } from '@/features/auth/ResetConfirmForm'

import type { GraphQLReplies } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { CUSTOMER_EMAIL, renderWithRouter } from '../../helpers/render'

/*
 * ⚠️ Spied, not stubbed out — see `LoginForm.test.tsx` for why only `reset` is wrapped and the real hook
 * still runs underneath it.
 */
const turnstileReset = vi.fn()

vi.mock('@/features/auth/useTurnstileToken', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/features/auth/useTurnstileToken')>()

	return {
		useTurnstileToken: () => {
			const real = actual.useTurnstileToken()

			return {
				...real,
				reset: () => {
					turnstileReset()
					real.reset()
				}
			}
		}
	}
})

afterEach(() => {
	turnstileReset.mockClear()
})

const HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const PASSWORD = 'a passphrase that is long enough'

const ACCEPTED: GraphQLReplies = { UserUpdatePwd: { data: { userUpdatePwd: true } } }

/** Every failure arrives as this one flat 403: a wrong hash, a used hash and an expired hash all alike. */
const REFUSED: GraphQLReplies = { UserUpdatePwd: { errors: [graphQLError('Invalid request')], status: 403 } }

const mount = async (replies: GraphQLReplies = ACCEPTED) => {
	const stub = stubGraphQL(replies)
	const result = await renderWithRouter(<ResetConfirmForm email={CUSTOMER_EMAIL} hash={HASH} />, {
		path: '/reset-password/confirm'
	})

	return { ...result, stub, user: userEvent.setup() }
}

const fillIn = async (user: ReturnType<typeof userEvent.setup>, password = PASSWORD, repeat = password) => {
	await user.type(screen.getByLabelText('New password'), password)
	await user.type(screen.getByLabelText('Repeat new password'), repeat)
}

const submit = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(screen.getByRole('button', { name: 'Set new password' }))
}

describe('ResetConfirmForm credentials', () => {
	/*
	 * ⚠️ The address and the hash come from the URL, never from fields. Neither is rendered: the address
	 * would be readable over a shoulder, and the hash is a one-time credential with no business being
	 * selectable and copyable off the page.
	 */
	it('renders neither the address nor the hash', async () => {
		const { container } = await mount()

		expect(container.textContent).not.toContain(CUSTOMER_EMAIL)
		expect(container.textContent).not.toContain(HASH)
	})

	it('asks only for the new password, twice', async () => {
		await mount()

		expect(screen.queryAllByRole('textbox')).toHaveLength(0)
		expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password')
		expect(screen.getByLabelText('Repeat new password')).toHaveAttribute('autocomplete', 'new-password')
	})

	it('states the password rule', async () => {
		await mount()

		expect(screen.getByText(/At least 10 characters/)).toBeInTheDocument()
	})

	it('matches the snapshot', async () => {
		const { container } = await mount()

		expect(container.firstChild).toMatchSnapshot()
	})
})

describe('ResetConfirmForm validation', () => {
	it('refuses a password under the minimum', async () => {
		const { user, stub } = await mount()

		await fillIn(user, 'short')
		await submit(user)

		expect(await screen.findByText('Use at least 10 characters.')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	// A refusal that never reached the server spent no token — resetting the widget here would tear down a
	// challenge the visitor may already be mid-way through solving, for no reason.
	it('does not reset the Turnstile widget on a validation refusal', async () => {
		const { user } = await mount()

		await fillIn(user, 'short')
		await submit(user)

		await screen.findByText('Use at least 10 characters.')
		expect(turnstileReset).not.toHaveBeenCalled()
	})

	it('refuses a confirmation that does not match', async () => {
		const { user, stub } = await mount()

		await fillIn(user, PASSWORD, `${PASSWORD} not`)
		await submit(user)

		expect(await screen.findByText('The two passwords do not match.')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})
})

describe('ResetConfirmForm submission', () => {
	it('sends the hash from the link along with the new password', async () => {
		const { user, stub } = await mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(stub.calls).toHaveLength(1)
		})
		expect(stub.calls[0]?.operationName).toBe('UserUpdatePwd')
		expect(stub.calls[0]?.variables).toMatchObject({
			email: CUSTOMER_EMAIL,
			hash: HASH,
			password: PASSWORD,
			turnstileToken: null
		})
	})

	// The confirmation field is never sent: the server has nothing to compare it against, and a second
	// copy of a password on the wire is one more place it can be logged.
	it('sends the password once', async () => {
		const { user, stub } = await mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(stub.calls[0]?.variables).not.toHaveProperty('repeatPassword')
		})
	})

	it('sends it to the public resource service', async () => {
		const { user, stub } = await mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(stub.calls[0]?.url).toBe(ENDPOINT.publicResource)
		})
	})

	it('says what it is doing while it waits', async () => {
		const { user } = await mount({ UserUpdatePwd: { pending: true } })

		await fillIn(user)
		await submit(user)

		expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
	})
})

describe('ResetConfirmForm on success', () => {
	it('confirms the password changed', async () => {
		const { user } = await mount()

		await fillIn(user)
		await submit(user)

		expect(await screen.findByRole('status')).toHaveTextContent('Your password has been changed.')
	})

	it('does not reset the Turnstile widget on success', async () => {
		const { user } = await mount()

		await fillIn(user)
		await submit(user)

		await screen.findByRole('status')
		expect(turnstileReset).not.toHaveBeenCalled()
	})

	/*
	 * ⚠️ It does **not** sign the customer in. Completing a reset proves control of the inbox, not of the
	 * password that was just set — an automatic sign-in would hand a session to whoever opened the mail.
	 * They go to the login form and use what they typed.
	 */
	it('sends them to the login form rather than signing them in', async () => {
		const { user } = await mount()

		await fillIn(user)
		await submit(user)

		await screen.findByRole('status')

		const link = screen.getByRole('link', { name: 'Sign in' })

		expect(link).toHaveAttribute('href', '/login')
		/*
		 * ⚠️ The whole sentence, spaces included. A JSX `{' '}` between an element and the text after it is
		 * the only thing holding them apart — JSX drops the newline itself — so losing it renders
		 * "Sign inwith the new one." with the link swallowing the first word. Asserting the link and the
		 * text separately passes on exactly that markup.
		 */
		expect(link.closest('p')?.textContent).toBe('Sign in with the new one.')
	})

	it('replaces the form', async () => {
		const { user } = await mount()

		await fillIn(user)
		await submit(user)

		await screen.findByRole('status')
		expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
	})

	it('matches the snapshot', async () => {
		const { user, container } = await mount()

		await fillIn(user)
		await submit(user)

		await screen.findByRole('status')
		expect(container.firstChild).toMatchSnapshot()
	})
})

describe('ResetConfirmForm on refusal', () => {
	it('shows the message the server sent', async () => {
		const { user } = await mount(REFUSED)

		await fillIn(user)
		await submit(user)

		expect(await screen.findByRole('alert')).toHaveTextContent('Invalid request')
	})

	/*
	 * ⚠️ The server cannot tell a wrong hash from an expired one without saying whether the address exists,
	 * so the copy names the likely cause and offers the way out rather than pretending to diagnose it. This
	 * paragraph only appears once something has actually failed — before that it is noise on a form that is
	 * about to work.
	 */
	it('explains the expiry and offers a new link', async () => {
		const { user } = await mount(REFUSED)

		await fillIn(user)
		await submit(user)

		await screen.findByRole('alert')

		const link = screen.getByRole('link', { name: 'Ask for a new one' })

		expect(link).toHaveAttribute('href', '/reset-password')
		// The sentence is read whole for the same reason as the one above: the `{' '}` before the link is what
		// keeps "used." and "Ask" from running together into a word neither of them is.
		expect(link.closest('p')?.textContent).toBe(
			'A reset link stops working 60 minutes after it is sent, and again once it has been used. Ask for a new one.'
		)
	})

	it('says nothing about expiry before anything has failed', async () => {
		await mount(REFUSED)

		expect(screen.queryByText(/60 minutes/)).not.toBeInTheDocument()
	})

	it('keeps the form so a new password can be typed', async () => {
		const { user } = await mount(REFUSED)

		await fillIn(user)
		await submit(user)

		await screen.findByRole('alert')
		expect(screen.getByLabelText('New password')).toBeInTheDocument()
	})

	it('falls back to the generic message when the server is unreachable', async () => {
		const { user } = await mount({ UserUpdatePwd: { networkError: 'ECONNREFUSED 127.0.0.1:4027' } })

		await fillIn(user)
		await submit(user)

		expect(await screen.findByRole('alert')).toHaveTextContent('Error while communicating with the server')
	})

	/*
	 * ⚠️ The server verifies Turnstile before anything else, so this refusal has already spent the token —
	 * every retry would be rejected as a Cloudflare duplicate until this runs. See `useTurnstileToken`.
	 */
	it('resets the Turnstile widget so the next attempt gets a fresh token', async () => {
		const { user } = await mount(REFUSED)

		await fillIn(user)
		await submit(user)

		await screen.findByRole('alert')
		expect(turnstileReset).toHaveBeenCalledTimes(1)
	})
})
