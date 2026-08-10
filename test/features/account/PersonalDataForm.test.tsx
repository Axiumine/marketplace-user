import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { PersonalDataForm } from '@/features/account/PersonalDataForm'

import { renderInAccount } from '../../helpers/account'
import type { GraphQLReplies } from '../../helpers/graphql'
import { graphQLError } from '../../helpers/graphql'
import type { MeFixture } from '../../helpers/me'
import { FRESH_ME, FULL_ME, NAMED_ONLY_ME } from '../../helpers/me'
import { CUSTOMER_EMAIL } from '../../helpers/render'

const SAVED: GraphQLReplies = { UserPersonalDataUpdate: { data: { userPersonalDataUpdate: true } } }

const mount = async (me: MeFixture = FULL_ME, replies: GraphQLReplies = SAVED) => {
	const rendered = await renderInAccount(<PersonalDataForm />, { me, replies })

	await screen.findByLabelText('First name')

	return { ...rendered, user: userEvent.setup() }
}

const save = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(screen.getByRole('button', { name: 'Save details' }))
}

const written = (stub: { calls: readonly { operationName: string; variables: Record<string, unknown> }[] }) =>
	stub.calls.find((call) => call.operationName === 'UserPersonalDataUpdate')

const personalDataOf = (stub: Parameters<typeof written>[0]) =>
	written(stub)?.variables.personalData as Record<string, unknown> | undefined

/**
 * A fresh account saved with the two fields the form requires and nothing else — the arrangement every
 * "what does an omitted field become on the wire?" test needs before it can read the mutation's payload.
 * Returns once the write has actually left, so the caller can assert on it without a `waitFor` of its own.
 */
const saveNameOnly = async () => {
	const { user, stub } = await mount(FRESH_ME)

	await user.type(screen.getByLabelText('First name'), 'Julia')
	await user.type(screen.getByLabelText('Last name'), 'Rivers')
	await save(user)

	await waitFor(() => {
		expect(written(stub)).toBeDefined()
	})

	return stub
}

describe('PersonalDataForm on a fresh account', () => {
	/*
	 * ⚠️ `personalData` is null on a fresh account and this form is what creates it. Registration takes an
	 * email and a password and nothing else, so "no personal data yet" is an ordinary state a real account
	 * sits in — not a loading state and not an error.
	 */
	it('opens empty rather than refusing to render', async () => {
		await mount(FRESH_ME)

		expect(screen.getByLabelText('First name')).toHaveValue('')
		expect(screen.getByLabelText('Date of birth')).toHaveValue('')
		expect(screen.getByLabelText('Mobile')).toHaveValue('')
	})

	it('creates the personal data with one save', async () => {
		const { user, stub } = await mount(FRESH_ME)

		await user.type(screen.getByLabelText('First name'), 'Julia')
		await user.type(screen.getByLabelText('Last name'), 'Rivers')
		await save(user)

		await waitFor(() => {
			expect(personalDataOf(stub)).toMatchObject({ firstName: 'Julia', lastName: 'Rivers' })
		})
	})
})

describe('PersonalDataForm on an account in use', () => {
	it('opens with what is stored', async () => {
		await mount()

		expect(screen.getByLabelText('First name')).toHaveValue('Julia')
		expect(screen.getByLabelText('Last name')).toHaveValue('Rivers')
		expect(screen.getByLabelText('Mobile')).toHaveValue('3331234567')
	})

	// An `<input type="date">` accepts `YYYY-MM-DD` and nothing else. The stored value is an ISO-8601
	// timestamp, and handing the control the whole string leaves it empty with no error.
	it('trims the stored timestamp down to a date the control accepts', async () => {
		await mount()

		expect(screen.getByLabelText('Date of birth')).toHaveValue('1990-04-17')
	})

	// `''` for anything absent — a controlled input handed `undefined` becomes uncontrolled and warns.
	it('shows an empty field for a contact that was never filled in', async () => {
		await mount()

		expect(screen.getByLabelText('Landline')).toHaveValue('')
	})

	it('matches the snapshot', async () => {
		const { container } = await mount()

		expect(container.firstChild).toMatchSnapshot()
	})

	/*
	 * ⚠️ `birth` and `contacts` are nullable *inside* a `personalData` that exists — and this is the account
	 * that proves it, because it is the one this very form produces when the optional fields are left blank.
	 * Optional-chaining `personalData` alone and then reading `contacts.mobile` works on a fresh account (the
	 * chain short-circuits) and on a full one (the subdocument is there), and throws on exactly this one:
	 * every customer who saved a name and stopped there opens the screen to a blank page.
	 */
	it('opens without crashing on a name saved with no birth date and no contacts', async () => {
		await mount(NAMED_ONLY_ME)

		expect(screen.getByLabelText('First name')).toHaveValue('Julia')
		expect(screen.getByLabelText('Date of birth')).toHaveValue('')
		expect(screen.getByLabelText('Mobile')).toHaveValue('')
		expect(screen.getByLabelText('Landline')).toHaveValue('')
		expect(screen.getByLabelText('Contact email')).toHaveValue('')
	})
})

describe('PersonalDataForm login address', () => {
	/*
	 * ⚠️ `contacts.email` is **not** the login address. The login address is `me.email` and is changed
	 * nowhere in this app; this one is "where to reach me about an order", which for a customer is often a
	 * different mailbox. Saying so plainly is the whole defence against somebody typing a new address here
	 * and expecting to sign in with it.
	 */
	it('says which address signs the customer in', async () => {
		await mount()

		expect(screen.getByText(CUSTOMER_EMAIL)).toBeInTheDocument()
		expect(screen.getByText(/That address is not changed here/)).toBeInTheDocument()
	})

	// `email` and not `username`: `username` is what the login field carries, and offering a password
	// manager a second "username" on this page is how it saves the wrong one.
	it('keeps the contact field out of the password manager’s username slot', async () => {
		await mount()

		expect(screen.getByLabelText('Contact email')).toHaveAttribute('autocomplete', 'email')
	})
})

describe('PersonalDataForm validation', () => {
	it('requires a first and last name', async () => {
		const { user, stub } = await mount(FRESH_ME)

		await save(user)

		expect(await screen.findByText('First name is required.')).toBeInTheDocument()
		expect(screen.getByText('Last name is required.')).toBeInTheDocument()
		expect(written(stub)).toBeUndefined()
	})

	// `.trim()` runs before the length check, so a field of spaces fails `min(1)` rather than saving a name
	// made of whitespace.
	it('treats a field of spaces as empty', async () => {
		const { user } = await mount(FRESH_ME)

		await user.type(screen.getByLabelText('First name'), '   ')
		await user.type(screen.getByLabelText('Last name'), 'Rivers')
		await save(user)

		expect(await screen.findByText('First name is required.')).toBeInTheDocument()
	})

	// The trimmed value is what the resolver receives too: zod transforms the parsed output, and
	// react-hook-form hands the resolver's output to the submit handler, not the raw input.
	it('sends the trimmed name, not the typed one', async () => {
		const { user, stub } = await mount(FRESH_ME)

		await user.type(screen.getByLabelText('First name'), '  Julia  ')
		await user.type(screen.getByLabelText('Last name'), 'Rivers')
		await save(user)

		await waitFor(() => {
			expect(personalDataOf(stub)).toMatchObject({ firstName: 'Julia' })
		})
	})

	it('refuses a contact address that is not one', async () => {
		const { user, stub } = await mount()

		await user.clear(screen.getByLabelText('Contact email'))
		await user.type(screen.getByLabelText('Contact email'), 'not-an-address')
		await save(user)

		expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument()
		expect(written(stub)).toBeUndefined()
	})

	// An empty contact address is not an invalid one — it is the customer saying "write to my sign-in
	// address", which is the documented default.
	it('accepts an empty contact address', async () => {
		const { user, stub } = await mount()

		await user.clear(screen.getByLabelText('Contact email'))
		await save(user)

		await waitFor(() => {
			expect(written(stub)).toBeDefined()
		})
	})

	it('caps a name at fifty characters', async () => {
		const { user } = await mount(FRESH_ME)

		await user.type(screen.getByLabelText('First name'), 'a'.repeat(51))
		await user.type(screen.getByLabelText('Last name'), 'Rivers')
		await save(user)

		expect(await screen.findByText('First name must be at most 50 characters.')).toBeInTheDocument()
	})

	it('caps a phone number at twenty characters', async () => {
		const { user } = await mount()

		await user.clear(screen.getByLabelText('Mobile'))
		await user.type(screen.getByLabelText('Mobile'), '1'.repeat(21))
		await save(user)

		expect(await screen.findByText('Use at most 20 characters.')).toBeInTheDocument()
	})
})

describe('PersonalDataForm empty optionals', () => {
	/*
	 * ⚠️ An empty string is a *value*: it would be stored, and it would come back as an empty contact
	 * rather than as no contact. `undefined` omits the key from the JSON entirely, which is what the
	 * nullable server-side fields expect.
	 */
	it('omits a contact that was left blank instead of storing an empty string', async () => {
		const { user, stub } = await mount()

		await save(user)

		await waitFor(() => {
			expect(personalDataOf(stub)?.contacts).toMatchObject({ mobile: '3331234567', email: 'orders@marketplace.it' })
		})
		expect((personalDataOf(stub)?.contacts as Record<string, unknown>).landline).toBeUndefined()
	})

	/*
	 * All three blank means **no contacts at all**, not a contacts object with three holes in it — the
	 * difference is whether the stored document grows an empty subdocument for nothing.
	 */
	it('omits the whole contacts object when every field is blank', async () => {
		const stub = await saveNameOnly()

		expect(personalDataOf(stub)?.contacts).toBeUndefined()
	})

	/*
	 * ⚠️ "Every field is blank" is the only thing that drops `contacts`, and each of the three has to be able
	 * to hold it on its own — a customer who gave a landline and no mobile has given a contact, and a
	 * condition that took any one blank field as "no contacts" would throw that landline away on save while
	 * leaving it on screen. The customer sees their number in the box, and it is in no database.
	 */
	it.each([
		['Landline', '0212345678', 'landline'],
		['Mobile', '3339876543', 'mobile'],
		['Contact email', 'julia@example.test', 'email']
	])('sends the contacts when only the %s is filled', async (label, value, key) => {
		const { user, stub } = await mount(FRESH_ME)

		await user.type(screen.getByLabelText('First name'), 'Julia')
		await user.type(screen.getByLabelText('Last name'), 'Rivers')
		await user.type(screen.getByLabelText(label), value)
		await save(user)

		await waitFor(() => {
			expect(written(stub)).toBeDefined()
		})
		expect(personalDataOf(stub)?.contacts).toEqual({ mobile: undefined, landline: undefined, email: undefined, [key]: value })
	})

	// `.trim()` runs on the phone fields before anything else, so a number made of spaces is no number: it
	// is dropped like an empty one rather than stored as whitespace the server would faithfully keep.
	it('treats a phone number of spaces as no number at all', async () => {
		const { user, stub } = await mount()

		await user.clear(screen.getByLabelText('Mobile'))
		await user.type(screen.getByLabelText('Mobile'), '   ')
		await save(user)

		await waitFor(() => {
			expect(written(stub)).toBeDefined()
		})
		expect((personalDataOf(stub)?.contacts as Record<string, unknown>).mobile).toBeUndefined()
	})

	it('omits the birth date when it was left blank', async () => {
		const stub = await saveNameOnly()

		expect(personalDataOf(stub)?.birth).toBeUndefined()
	})

	it('sends the birth date when there is one', async () => {
		const { user, stub } = await mount()

		await save(user)

		await waitFor(() => {
			expect(personalDataOf(stub)?.birth).toEqual({ date: '1990-04-17' })
		})
	})
})

describe('PersonalDataForm result', () => {
	it('sends the write to the user resource service', async () => {
		const { user, stub } = await mount()

		await save(user)

		await waitFor(() => {
			expect(written(stub)).toBeDefined()
		})
		expect(stub.calls.find((call) => call.operationName === 'UserPersonalDataUpdate')?.url).toBe(ENDPOINT.userResource)
	})

	/*
	 * ⚠️ The tone is asserted through its colour, not through the role alone. `FormStatus` maps anything that
	 * is not `error` onto `role="status"`, so a confirmation that lost its tone still announces politely and
	 * still reads correctly to a screen reader — while rendering with no colour at all, which is the entire
	 * signal a sighted customer gets that the save went through rather than failed.
	 */
	it('confirms the save, in the colour of a success', async () => {
		const { user } = await mount()

		await save(user)

		const done = await screen.findByRole('status')

		expect(done).toHaveTextContent('Your details have been saved.')
		expect(done).toHaveClass('text-app-ok')
	})

	/*
	 * ⚠️ A confirmation needs a payload, not merely the absence of an error. `{"data": null}` is the shape
	 * GraphQL emits when an error propagates to a non-nullable root field, and the envelope can carry that
	 * null with no `errors` array at all — which is why `dataOf` exists and why a bare `result.error` test is
	 * not enough. Reading it as a save tells the customer their details are stored when nothing reached the
	 * database: the next reload shows the old values back, and nothing on screen ever admitted it.
	 *
	 * What is asserted is the *absence* of the confirmation, not an error message, because there is no error
	 * to quote: `messageOf(undefined)` is the empty string and `FormStatus` renders nothing for it. That is
	 * the honest outcome for a malformed envelope — the form stays as it was, ready to be submitted again —
	 * and it is deliberately not dressed up as a server error the server never reported.
	 */
	it('does not claim a save when the answer carried no payload', async () => {
		const { user } = await mount(FULL_ME, { UserPersonalDataUpdate: { body: '{"data":null}' } })

		await save(user)

		await waitFor(() => {
			expect(screen.getByRole('button', { name: 'Save details' })).toBeEnabled()
		})
		expect(screen.queryByRole('status')).not.toBeInTheDocument()
		expect(screen.queryByText('Your details have been saved.')).not.toBeInTheDocument()
	})

	it('shows the message the server sent when it refuses', async () => {
		const { user } = await mount(FULL_ME, {
			UserPersonalDataUpdate: { errors: [graphQLError('That date is in the future')], status: 400 }
		})

		await save(user)

		expect(await screen.findByRole('alert')).toHaveTextContent('That date is in the future')
	})

	it('says what it is doing while it waits', async () => {
		const { user } = await mount(FULL_ME, { UserPersonalDataUpdate: { pending: true } })

		await save(user)

		expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
	})
})
