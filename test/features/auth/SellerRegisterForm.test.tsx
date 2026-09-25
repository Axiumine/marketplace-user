import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { SellerRegisterForm } from '@/features/auth/SellerRegisterForm'

import type { GraphQLReplies } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { installOnlineListenerGuard } from '../../helpers/onlineListenerGuard'
import { PASSWORD, sharedFieldTests, sharedSuccessScreenTests, sharedValidationTests } from '../../helpers/registrationForm'
import { renderWithClient } from '../../helpers/render'

installOnlineListenerGuard()

/*
 * ⚠️ Spied, not stubbed out — see `LoginForm.test.tsx` for why only `reset` is wrapped and the real hook
 * still runs underneath it. `SellerRegisterForm` reaches it through `useRegistration`, not directly, so
 * the module path is what the mock keys on rather than the call site.
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

const SELLER_EMAIL = 'seller@marketplace.it'

const ACCEPTED: GraphQLReplies = { ShopOwnerRegister: { data: { shopOwnerRegister: true } } }

const mount = (replies: GraphQLReplies = ACCEPTED) => {
	const stub = stubGraphQL(replies)
	const result = renderWithClient(<SellerRegisterForm />)

	return { ...result, stub, user: userEvent.setup() }
}

const fillIn = async (
	user: ReturnType<typeof userEvent.setup>,
	{ email = SELLER_EMAIL, password = PASSWORD, repeat = PASSWORD } = {}
) => {
	await user.type(screen.getByLabelText('Email'), email)
	await user.type(screen.getByLabelText('Password'), password)
	await user.type(screen.getByLabelText('Repeat password'), repeat)
}

const submit = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(screen.getByRole('button', { name: 'Apply to sell' }))
}

/** What the shared half of the contract drives this form through. */
const harness = { mount, fillIn, submit }

describe('SellerRegisterForm fields', () => {
	/*
	 * Email and password, and deliberately not one field more. The company, the trading name, the VAT
	 * number and the catalogue are all collected in the shop-owner app after an admin has approved the
	 * account — asking for them here would collect a business's registration details against an address
	 * nobody has confirmed, for an application that may be refused.
	 */
	sharedFieldTests(harness)

	// The button says what pressing it starts — an application — rather than "create account", which would
	// promise an account that this form cannot open on its own.
	it('names the button after what it starts', () => {
		mount()

		expect(screen.getByRole('button', { name: 'Apply to sell' })).toBeInTheDocument()
	})

	it('matches the snapshot', () => {
		const { container } = mount()

		expect(container.firstChild).toMatchSnapshot()
	})
})

describe('SellerRegisterForm validation', () => {
	sharedValidationTests(harness)
})

describe('SellerRegisterForm submission', () => {
	/*
	 * ⚠️ **`ShopOwnerRegister`, never `UserRegister`.** The two mutations take the same four arguments and
	 * both answer `true` for an address they will not act on, so the wrong one is invisible from here — the
	 * form would report the same success while writing a customer account and mailing a link into an app
	 * with no panel for a seller. The operation name is the only thing that says which collection was
	 * written, which is why it is asserted rather than merely counted.
	 */
	it('sends the seller registration to the public resource service', async () => {
		const { user, stub } = mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(stub.calls).toHaveLength(1)
		})
		expect(stub.calls[0]?.operationName).toBe('ShopOwnerRegister')
		expect(stub.calls[0]?.url).toBe(ENDPOINT.publicResource)
	})

	it('sends both passwords', async () => {
		const { user, stub } = mount()

		await fillIn(user)
		await submit(user)

		await waitFor(() => {
			expect(stub.calls[0]?.variables).toMatchObject({
				email: SELLER_EMAIL,
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
		const { user } = mount({ ShopOwnerRegister: { pending: true } })

		await fillIn(user)
		await submit(user)

		expect(await screen.findByRole('button', { name: 'Sending your application…' })).toBeDisabled()
	})
})

describe('SellerRegisterForm success screen', () => {
	/*
	 * ⚠️ "If that address can be registered", never "check your inbox" — the same rule the customer's form
	 * follows, and for the same reason: the mutation answers `true` for an address that is already a seller,
	 * and copy that told the two cases apart would make this form an account-enumeration oracle over the
	 * `shopOwner` collection.
	 */
	it('does not confirm that the address was new', async () => {
		const { user } = mount()

		await fillIn(user)
		await submit(user)

		expect(await screen.findByRole('status')).toHaveTextContent(`If ${SELLER_EMAIL} can be registered`)
	})

	sharedSuccessScreenTests(harness)

	/*
	 * ⚠️ The half that is specific to a seller, and the reason this screen is not the customer's.
	 * `shopOwnerRegister` writes `waitApprov: true`, and the shop-owner authorization service refuses a
	 * session while that flag is up — so a page that stopped at "check your inbox" would send somebody to
	 * confirm an address and then to a sign-in that fails with no explanation, which reads as a broken
	 * registration rather than as a queue.
	 */
	it('says the account waits for an admin after the address is confirmed', async () => {
		const { user } = mount()

		await fillIn(user)
		await submit(user)

		await screen.findByRole('status')
		expect(screen.getByText(/first of two steps/)).toHaveTextContent('signing in before then is not possible')
	})

	it('matches the snapshot', async () => {
		const { user, container } = mount()

		await fillIn(user)
		await submit(user)

		await screen.findByRole('status')
		expect(container.firstChild).toMatchSnapshot()
	})

	it('does not reset the Turnstile widget on success', async () => {
		const { user } = mount()

		await fillIn(user)
		await submit(user)

		await screen.findByRole('status')
		expect(turnstileReset).not.toHaveBeenCalled()
	})
})

describe('SellerRegisterForm on failure', () => {
	it('shows the message the server sent', async () => {
		const { user } = mount({
			ShopOwnerRegister: { errors: [graphQLError('Too many attempts, try again later', undefined, 429)], status: 429 }
		})

		await fillIn(user)
		await submit(user)

		expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts, try again later')
	})

	it('keeps the form on screen so the attempt can be repeated', async () => {
		const { user } = mount({ ShopOwnerRegister: { errors: [graphQLError('Too many attempts')], status: 429 } })

		await fillIn(user)
		await submit(user)

		await screen.findByRole('alert')
		expect(screen.getByLabelText('Email')).toHaveValue(SELLER_EMAIL)
	})

	/*
	 * A transport failure is the case a bare `result.error` test gets wrong: an envelope with no data and no
	 * error would be read as a success, and somebody whose application never left the browser would be told
	 * to go and wait for a mail nobody sent.
	 */
	it('never reaches the success screen on a transport failure', async () => {
		const { user } = mount({ ShopOwnerRegister: { networkError: 'ECONNREFUSED 127.0.0.1:4027' } })

		await fillIn(user)
		await submit(user)

		const alert = await screen.findByRole('alert')

		expect(alert).toHaveTextContent('Error while communicating with the server')
		expect(screen.queryByRole('status')).not.toBeInTheDocument()
	})

	/*
	 * ⚠️ The server verifies Turnstile before anything else, so this refusal has already spent the token —
	 * every retry would be rejected as a Cloudflare duplicate until this runs. See `useTurnstileToken`.
	 */
	it('resets the Turnstile widget so the next attempt gets a fresh token', async () => {
		const { user } = mount({
			ShopOwnerRegister: { errors: [graphQLError('Too many attempts, try again later', undefined, 429)], status: 429 }
		})

		await fillIn(user)
		await submit(user)

		await screen.findByRole('alert')
		expect(turnstileReset).toHaveBeenCalledTimes(1)
	})

	// A refusal that never reached the server spent no token — resetting the widget here would tear down a
	// challenge the visitor may already be mid-way through solving, for no reason.
	it('does not reset the Turnstile widget on a validation refusal', async () => {
		const { user } = mount()

		await fillIn(user, { password: 'short', repeat: 'short' })
		await submit(user)

		await screen.findByText('Use at least 10 characters.')
		expect(turnstileReset).not.toHaveBeenCalled()
	})
})
