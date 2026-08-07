import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { getAccessToken } from '@/api/tokenStore'
import { getSession } from '@/auth/session'
import { LoginForm } from '@/features/auth/LoginForm'

import type { GraphQLReplies } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { CUSTOMER_EMAIL, renderWithRouter } from '../../helpers/render'

const PASSWORD = 'a passphrase that is long enough'

const ACCEPTED: GraphQLReplies = { LoginUser: { data: { loginUser: { accessToken: 'minted-token' } } } }

/**
 * The generic refusal every failed login gets: unknown address, wrong password, unverified email and
 * disabled account all answer with this one message, which is what stops the form enumerating accounts.
 */
const REFUSED: GraphQLReplies = {
	LoginUser: { errors: [graphQLError('Wrong credentials', undefined, 403)], status: 403 }
}

const mount = async (replies: GraphQLReplies = ACCEPTED) => {
	const stub = stubGraphQL(replies)
	const result = await renderWithRouter(<LoginForm />, { path: '/login' })

	return { ...result, stub, user: userEvent.setup() }
}

const fillIn = async (user: ReturnType<typeof userEvent.setup>, email = CUSTOMER_EMAIL, password = PASSWORD) => {
	await user.type(screen.getByLabelText('Email'), email)
	await user.type(screen.getByLabelText('Password'), password)
}

const submit = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

const loginCall = (stub: { calls: readonly { operationName: string; variables: Record<string, unknown> }[] }) =>
	stub.calls.find((call) => call.operationName === 'LoginUser')

describe('LoginForm fields', () => {
	/*
	 * `username` on an email field is what a password manager reads to pair the address with the password
	 * it stores — `email` alone leaves it guessing, and it then offers to save a second entry for the same
	 * account.
	 */
	it('names the fields so a password manager can fill them', async () => {
		await mount()

		expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'username')
		expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
	})

	it('offers a way to the reset flow', async () => {
		await mount()

		expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/reset-password')
	})

	it('starts with the session unchecked', async () => {
		await mount()

		expect(screen.getByRole('checkbox', { name: 'Keep me signed in' })).not.toBeChecked()
	})
})

describe('LoginForm validation', () => {
	it('refuses an address that is not one', async () => {
		const { user, stub } = await mount()

		await fillIn(user, 'not-an-address')
		await submit(user)

		expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	it('refuses an empty password', async () => {
		const { user, stub } = await mount()

		await user.type(screen.getByLabelText('Email'), CUSTOMER_EMAIL)
		await submit(user)

		expect(await screen.findByText('Enter your password.')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	/*
	 * ⚠️ The password is **not** length-validated here, and that is not an oversight. A login form that
	 * rejects a nine-character password before sending it tells an attacker that no account uses one — and
	 * it locks out anyone whose password predates a rule change. The rules belong on registration.
	 */
	it('sends a password shorter than the registration minimum', async () => {
		const { user, stub } = await mount()

		await fillIn(user, CUSTOMER_EMAIL, 'short')
		await submit(user)

		await waitFor(() => {
			expect(loginCall(stub)).toBeDefined()
		})
		expect(loginCall(stub)?.variables.password).toBe('short')
	})

	// `noValidate`, so the browser's own bubble never competes with the message the resolver produced —
	// two error messages for one field, one of them unstyled and untranslated.
	it('leaves the browser out of the validation', async () => {
		const { container } = await mount()

		expect(container.querySelector('form')).toHaveAttribute('novalidate')
	})
})

describe('LoginForm submission', () => {
	it('sends the credentials to the public authorization service', async () => {
		const { user, stub } = await mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(loginCall(stub)).toBeDefined()
		})
		expect(stub.calls.find((call) => call.operationName === 'LoginUser')?.url).toBe(ENDPOINT.publicAuthorization)
	})

	it('sends the address and password that were typed', async () => {
		const { user, stub } = await mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(loginCall(stub)?.variables).toMatchObject({ email: CUSTOMER_EMAIL, password: PASSWORD })
		})
	})

	it('sends the session preference the customer chose', async () => {
		const { user, stub } = await mount()

		await fillIn(user)
		await user.click(screen.getByRole('checkbox', { name: 'Keep me signed in' }))
		await submit(user)

		await waitFor(() => {
			expect(loginCall(stub)?.variables.rememberMe).toBe(true)
		})
	})

	/*
	 * ⚠️ `null` is a legitimate token: the widget renders nothing when no site key is configured, which is
	 * the normal state of a developer machine and of this suite. The server verifies a token only when it
	 * holds a secret of its own, so a tokenless request cannot weaken a deployment that has one.
	 */
	it('sends a null turnstile token when no widget is configured', async () => {
		const { user, stub } = await mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(loginCall(stub)?.variables).toHaveProperty('turnstileToken', null)
		})
	})
})

describe('LoginForm on success', () => {
	/*
	 * ⚠️ Order matters, and this is the assertion that pins it. The token has to be readable before
	 * anything navigates, or the first private query fires with no `Authorization` header and bounces
	 * straight back to this page.
	 */
	it('stores the access token before it navigates', async () => {
		const { user, router } = await mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(router.state.location.pathname).toBe('/account')
		})
		expect(getAccessToken()).toBe('minted-token')
	})

	// The session store holds the address the customer typed — the mutation answers a token and nothing
	// else, so there is nowhere else for the header's "Account" link to learn it from.
	it('records the signed-in address', async () => {
		const { user } = await mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(getSession()).toEqual({ signedIn: true, email: CUSTOMER_EMAIL })
		})
	})
})

describe('LoginForm on refusal', () => {
	it('shows the message the server sent', async () => {
		const { user } = await mount(REFUSED)

		await fillIn(user)
		await submit(user)

		expect(await screen.findByRole('alert')).toHaveTextContent('Wrong credentials')
	})

	it('mints no session out of a refusal', async () => {
		const { user } = await mount(REFUSED)

		await fillIn(user)
		await submit(user)

		await screen.findByRole('alert')
		expect(getAccessToken()).toBeNull()
		expect(getSession().signedIn).toBe(false)
	})

	it('stays on the login page', async () => {
		const { user, router } = await mount(REFUSED)

		await fillIn(user)
		await submit(user)

		await screen.findByRole('alert')
		expect(router.state.location.pathname).toBe('/login')
	})

	// A second attempt clears the first failure before it starts, so a stale "wrong credentials" never
	// sits under a request that is still in flight.
	it('clears the previous failure on the next attempt', async () => {
		const { user } = await mount({ LoginUser: [REFUSED.LoginUser as never, ACCEPTED.LoginUser as never] })

		await fillIn(user)
		await submit(user)
		await screen.findByRole('alert')

		await submit(user)

		await waitFor(() => {
			expect(screen.queryByRole('alert')).not.toBeInTheDocument()
		})
	})

	// A transport failure has no GraphQL error to quote, and the generic line is what the visitor gets —
	// never the upstream address `CombinedError` carries.
	it('falls back to the generic message when the server is unreachable', async () => {
		const { user } = await mount({ LoginUser: { networkError: 'ECONNREFUSED 127.0.0.1:4028' } })

		await fillIn(user)
		await submit(user)

		const alert = await screen.findByRole('alert')

		expect(alert).toHaveTextContent('Error while communicating with the server')
		expect(alert).not.toHaveTextContent('127.0.0.1')
	})
})

describe('LoginForm while it is submitting', () => {
	it('says what it is doing', async () => {
		const { user } = await mount({ LoginUser: { pending: true } })

		await fillIn(user)
		await submit(user)

		expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeInTheDocument()
	})

	// Disabled, not merely relabelled: a second click sends a second `LoginUser` for the same credentials,
	// and the two races decide which token ends up in the store.
	it('cannot be submitted twice', async () => {
		const { user, stub } = await mount({ LoginUser: { pending: true } })

		await fillIn(user)
		await submit(user)

		expect(await screen.findByRole('button', { name: 'Signing in…' })).toBeDisabled()
		expect(stub.calls.filter((call) => call.operationName === 'LoginUser')).toHaveLength(1)
	})
})
