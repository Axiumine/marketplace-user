import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { RegisterForm } from '@/features/auth/RegisterForm'

import type { GraphQLReplies } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { PASSWORD, sharedFieldTests, sharedSuccessScreenTests, sharedValidationTests } from '../../helpers/registrationForm'
import { CUSTOMER_EMAIL, renderWithClient } from '../../helpers/render'

const ACCEPTED: GraphQLReplies = { UserRegister: { data: { userRegister: true } } }

const mount = (replies: GraphQLReplies = ACCEPTED) => {
	const stub = stubGraphQL(replies)
	const result = renderWithClient(<RegisterForm />)

	return { ...result, stub, user: userEvent.setup() }
}

const fillIn = async (
	user: ReturnType<typeof userEvent.setup>,
	{ email = CUSTOMER_EMAIL, password = PASSWORD, repeat = PASSWORD } = {}
) => {
	await user.type(screen.getByLabelText('Email'), email)
	await user.type(screen.getByLabelText('Password'), password)
	await user.type(screen.getByLabelText('Repeat password'), repeat)
}

const submit = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(screen.getByRole('button', { name: 'Create account' }))
}

/** What the shared half of the contract drives this form through. */
const harness = { mount, fillIn, submit }

describe('RegisterForm fields', () => {
	/*
	 * Email and password, nothing else. Name, phone number and addresses are collected after the address
	 * is confirmed — asking here puts a wall of fields in front of somebody who has not decided to stay,
	 * and collects personal data about an address that may never be verified.
	 */
	sharedFieldTests(harness)

	it('matches the snapshot', () => {
		const { container } = mount()

		expect(container.firstChild).toMatchSnapshot()
	})
})

describe('RegisterForm validation', () => {
	sharedValidationTests(harness)
})

describe('RegisterForm submission', () => {
	it('sends the registration to the public resource service', async () => {
		const { user, stub } = mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(stub.calls).toHaveLength(1)
		})
		expect(stub.calls[0]?.operationName).toBe('UserRegister')
		expect(stub.calls[0]?.url).toBe(ENDPOINT.publicResource)
	})

	// The server checks the pair too — the confirmation is not a client-side nicety it can be talked out
	// of by a request that skips this form.
	it('sends both passwords', async () => {
		const { user, stub } = mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(stub.calls[0]?.variables).toMatchObject({
				email: CUSTOMER_EMAIL,
				password: PASSWORD,
				repeatPassword: PASSWORD
			})
		})
	})

	it('sends a null turnstile token when no widget is configured', async () => {
		const { user, stub } = mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(stub.calls[0]?.variables).toHaveProperty('turnstileToken', null)
		})
	})

	it('says what it is doing while it waits', async () => {
		const { user } = mount({ UserRegister: { pending: true } })

		await fillIn(user)
		await submit(user)

		expect(await screen.findByRole('button', { name: 'Creating your account…' })).toBeDisabled()
	})
})

describe('RegisterForm success screen', () => {
	/*
	 * ⚠️ "If that address can be registered", never "check your inbox". The mutation answers `true` for an
	 * address that is already registered, and copy that distinguished the two cases would turn this form
	 * into the account-enumeration oracle the resolver deliberately refuses to be.
	 */
	it('does not confirm that the address was new', async () => {
		const { user } = mount()

		await fillIn(user)
		await submit(user)

		expect(await screen.findByRole('status')).toHaveTextContent(`If ${CUSTOMER_EMAIL} can be registered`)
	})

	sharedSuccessScreenTests(harness)

	it('matches the snapshot', async () => {
		const { user, container } = mount()

		await fillIn(user)
		await submit(user)

		await screen.findByRole('status')
		expect(container.firstChild).toMatchSnapshot()
	})
})

describe('RegisterForm on failure', () => {
	it('shows the message the server sent', async () => {
		const { user } = mount({
			UserRegister: { errors: [graphQLError('Registration is closed', undefined, 403)], status: 403 }
		})

		await fillIn(user)
		await submit(user)

		expect(await screen.findByRole('alert')).toHaveTextContent('Registration is closed')
	})

	it('keeps the form on screen so the attempt can be repeated', async () => {
		const { user } = mount({ UserRegister: { errors: [graphQLError('Registration is closed')], status: 403 } })

		await fillIn(user)
		await submit(user)

		await screen.findByRole('alert')
		expect(screen.getByLabelText('Email')).toHaveValue(CUSTOMER_EMAIL)
	})

	it('never reaches the success screen on a transport failure', async () => {
		const { user } = mount({ UserRegister: { networkError: 'ECONNREFUSED 127.0.0.1:4027' } })

		await fillIn(user)
		await submit(user)

		const alert = await screen.findByRole('alert')

		expect(alert).toHaveTextContent('Error while communicating with the server')
		expect(screen.queryByRole('status')).not.toBeInTheDocument()
	})
})
