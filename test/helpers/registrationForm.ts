import { screen } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'

import type { GraphQLStub } from './graphql'

/*
 * The part of the registration contract a customer and a seller answer identically, written once.
 *
 * Both forms ask for an address and a password and nothing else, both refuse the same three inputs, and
 * both replace themselves with the same success screen. What differs is everything around it — which
 * mutation is sent, what the button says, what the seller is told about the queue behind it — and that
 * stays in the suite it belongs to.
 *
 * These are called, not shared setup: each function declares its own `it` blocks inside the `describe` of
 * the caller, so a suite that stopped calling one would visibly lose those tests from its output rather
 * than quietly stop asserting. The form reaches them only through the harness the caller passes, so
 * neither suite can accidentally assert against the other's form.
 */

type TestUser = ReturnType<typeof userEvent.setup>

/** Long enough to pass the rule both forms state, so a refusal in a test is never about the length. */
export const PASSWORD = 'a passphrase that is long enough'

/** What a registration suite has to hand over for the shared tests to drive its own form. */
export interface RegistrationFormHarness {
	/** Renders the form with the replies that accept the registration. */
	mount: () => { user: TestUser; stub: GraphQLStub }
	/** Types into the three fields. The defaults are the address and password that suite registers with. */
	fillIn: (user: TestUser, overrides?: { email?: string; password?: string; repeat?: string }) => Promise<void>
	/** Presses the submit button, whatever that form calls it. */
	submit: (user: TestUser) => Promise<void>
}

/** The fields both forms show, and the two attributes that decide how a password manager treats them. */
export const sharedFieldTests = ({ mount }: RegistrationFormHarness): void => {
	it('asks for nothing but an address and a password', () => {
		mount()

		expect(screen.getAllByRole('textbox')).toHaveLength(1)
		expect(screen.getByLabelText('Password')).toBeInTheDocument()
		expect(screen.getByLabelText('Repeat password')).toBeInTheDocument()
	})

	/*
	 * `new-password` and not `current-password`: it is what makes a password manager offer to *generate*
	 * one, instead of trying to fill in an entry that does not exist yet.
	 */
	it('asks a password manager to generate rather than fill', () => {
		mount()

		expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password')
		expect(screen.getByLabelText('Repeat password')).toHaveAttribute('autocomplete', 'new-password')
	})

	it('states the password rule before it is broken', () => {
		mount()

		expect(screen.getByText(/At least 10 characters/)).toBeInTheDocument()
	})
}

/** The three inputs neither form sends: they are refused in the browser, and the stub proves it. */
export const sharedValidationTests = ({ mount, fillIn, submit }: RegistrationFormHarness): void => {
	it('refuses an address that is not one', async () => {
		const { user, stub } = mount()

		await fillIn(user, { email: 'not-an-address' })
		await submit(user)

		expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	it('refuses a password under the minimum', async () => {
		const { user, stub } = mount()

		await fillIn(user, { password: 'short', repeat: 'short' })
		await submit(user)

		expect(await screen.findByText('Use at least 10 characters.')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})

	// The message lands on the second field, where the person filling the form is looking — an object-level
	// issue has no path and react-hook-form renders it nowhere.
	it('refuses a confirmation that does not match', async () => {
		const { user, stub } = mount()

		await fillIn(user, { repeat: `${PASSWORD} not` })
		await submit(user)

		expect(await screen.findByText('The two passwords do not match.')).toBeInTheDocument()
		expect(stub.calls).toHaveLength(0)
	})
}

/** What the success screen does to the form it replaces, and the two facts it has to state. */
export const sharedSuccessScreenTests = ({ mount, fillIn, submit }: RegistrationFormHarness): void => {
	it('replaces the form rather than sitting under it', async () => {
		const { user } = mount()

		await fillIn(user)
		await submit(user)

		await screen.findByRole('status')
		expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
	})

	// Three days, and a second request replaces the first link — both facts matter to somebody staring at
	// an empty inbox, and neither is guessable.
	it('says how long the link lasts and what a second request does', async () => {
		const { user } = mount()

		await fillIn(user)
		await submit(user)

		await screen.findByRole('status')
		expect(screen.getByText(/three days/)).toHaveTextContent('a second request replaces the first link')
	})
}
