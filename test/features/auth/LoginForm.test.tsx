import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { getAccessToken } from '@/api/tokenStore'
import { getSession } from '@/auth/session'
import { LoginForm } from '@/features/auth/LoginForm'

import type { GraphQLReplies } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { stubLocationAssign } from '../../helpers/location'
import { CUSTOMER_EMAIL, renderWithRouter } from '../../helpers/render'

/*
 * ⚠️ Spied, not stubbed out. The rest of this file relies on the real `read()`/`onToken`/`token` — the
 * "sends a null turnstile token" tests among them — so only `reset` is wrapped, and it still calls the
 * real one underneath. What this buys is a call count independent of any Turnstile site key, which the
 * suite runs with none of: the real widget never mounts here, so nothing else could observe a remount.
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

const PASSWORD = 'a passphrase that is long enough'

const ACCEPTED: GraphQLReplies = { LoginUser: { data: { loginUser: { accessToken: 'minted-token' } } } }

/**
 * The generic refusal every failed login gets: unknown address, wrong password, unverified email and
 * disabled account all answer with this one message, which is what stops the form enumerating accounts.
 */
const REFUSED: GraphQLReplies = {
	LoginUser: { errors: [graphQLError('Wrong credentials', undefined, 403)], status: 403 }
}

/*
 * ⚠️ The location is stubbed **after** the render, never before. `renderWithRouter` moves jsdom's URL to
 * `/login` and then lets the browser history read `window.location`; a stub installed first would freeze
 * the router on a copy of the wrong location.
 */
const mount = async (replies: GraphQLReplies = ACCEPTED) => {
	const stub = stubGraphQL(replies)
	const result = await renderWithRouter(<LoginForm />, { path: '/login' })

	return { ...result, stub, assign: stubLocationAssign(), user: userEvent.setup() }
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

afterEach(() => {
	turnstileReset.mockClear()
})

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

	it('matches the snapshot', async () => {
		const { container } = await mount()

		expect(container.firstChild).toMatchSnapshot()
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

	// A refusal that never reached the server spent no token — resetting the widget here would tear down a
	// challenge the visitor may already be mid-way through solving, for no reason.
	it('does not reset the Turnstile widget on a validation refusal', async () => {
		const { user } = await mount()

		await user.type(screen.getByLabelText('Email'), CUSTOMER_EMAIL)
		await submit(user)

		await screen.findByText('Enter your password.')
		expect(turnstileReset).not.toHaveBeenCalled()
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
	 * ⚠️ A document load, not a router navigation, and this is the assertion that pins it (ADR-051). The
	 * header and the footer link to `/login` from every page, so a signed-in customer can reach this form
	 * without leaving the page — and the urql client is a module singleton whose document cache keys `Me`
	 * by nothing but the query, which takes no variables. A soft navigation would hand the second customer
	 * the first one's account. Only a load rebuilds the client.
	 */
	it('leaves the page for the account area', async () => {
		const { user, assign } = await mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(assign).toHaveBeenCalledExactlyOnceWith('/account')
		})
	})

	it('does not reset the Turnstile widget on a successful sign-in', async () => {
		const { user, assign } = await mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(assign).toHaveBeenCalled()
		})
		expect(turnstileReset).not.toHaveBeenCalled()
	})

	/*
	 * Both stores are module state that the load rebuilds empty, so neither value reaches the account
	 * page. They are written for the interval before the unload: the header reads `signedIn`, and a form
	 * that has just succeeded under a "Sign in" link is the frame this prevents.
	 */
	it('stores the access token and the signed-in address before it goes', async () => {
		const { user, assign } = await mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(assign).toHaveBeenCalled()
		})
		expect(getAccessToken()).toBe('minted-token')
		expect(getSession()).toEqual({ signedIn: true, email: CUSTOMER_EMAIL })
	})

	/*
	 * ⚠️ `assign` is asynchronous — the document is still here, and the form with it. `isSubmitting` drops
	 * back to false the moment the handler returns, so without a state of its own the button would go live
	 * again for the whole length of the load and a second click would buy a second `LoginUser`.
	 */
	it('stays busy while the browser leaves', async () => {
		const { user, stub, assign } = await mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(assign).toHaveBeenCalled()
		})

		const button = await screen.findByRole('button', { name: 'Signing in…' })

		expect(button).toBeDisabled()

		await user.click(button)
		expect(stub.calls.filter((call) => call.operationName === 'LoginUser')).toHaveLength(1)
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
		const { user, router, assign } = await mount(REFUSED)

		await fillIn(user)
		await submit(user)

		await screen.findByRole('alert')
		expect(router.state.location.pathname).toBe('/login')
		expect(assign).not.toHaveBeenCalled()
	})

	/*
	 * ⚠️ The server verifies Turnstile before it checks the password, so this refusal has already spent the
	 * token — every retry would be rejected as a Cloudflare duplicate, regardless of the credentials, until
	 * this runs. See `useTurnstileToken`'s own doc comment.
	 */
	it('resets the Turnstile widget so the next attempt gets a fresh token', async () => {
		const { user } = await mount(REFUSED)

		await fillIn(user)
		await submit(user)

		await screen.findByRole('alert')
		expect(turnstileReset).toHaveBeenCalledTimes(1)
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
