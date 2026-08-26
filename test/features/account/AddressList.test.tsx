import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { AddressList } from '@/features/account/AddressList'

import { renderInAccount } from '../../helpers/account'
import type { GraphQLReplies, GraphQLStub } from '../../helpers/graphql'
import { graphQLError } from '../../helpers/graphql'
import type { MeFixture } from '../../helpers/me'
import { CAPPED_ME, FRESH_ME, FULL_ME, HOME_ADDRESS, WORK_ADDRESS } from '../../helpers/me'

// ⚠️ The address form carries a MapLibre map, and jsdom has no WebGL context to build one in. Stubbed here
// for the same reason the form's own tests stub it — see `test/helpers/positionPicker.ts`.
vi.mock('@/features/map/PositionPickerIsland', async () => (await import('../../helpers/positionPicker')).positionPickerStub())

const WRITES: GraphQLReplies = {
	UserAddressDel: { data: { userAddressDel: true } },
	UserDefaultAddressSet: { data: { userDefaultAddressSet: true } }
}

const mount = async (me: MeFixture = FULL_ME, replies: GraphQLReplies = WRITES) => {
	const rendered = await renderInAccount(<AddressList />, { me, replies, path: '/account/addresses' })

	await screen.findByRole('button', { name: 'Add an address' })

	return { ...rendered, user: userEvent.setup() }
}

/** The card for one address — every row carries the same button names, so they are found within a row. */
const rowOf = (street: string): HTMLElement => {
	const item = screen.getByText(new RegExp(street)).closest('li')
	if (item === null) throw new Error(`No row for ${street}`)

	return item
}

const written = (stub: GraphQLStub) => stub.calls.filter((call) => call.operationName !== 'Me')

describe('AddressList with nothing saved', () => {
	it('says the address book is empty', async () => {
		await mount(FRESH_ME)

		expect(screen.getByText('You have no saved addresses yet.')).toBeInTheDocument()
	})

	it('lists nothing', async () => {
		await mount(FRESH_ME)

		expect(screen.queryAllByRole('listitem')).toHaveLength(0)
	})

	it('still offers to add one', async () => {
		await mount(FRESH_ME)

		expect(screen.getByRole('button', { name: 'Add an address' })).toBeInTheDocument()
	})

	it('matches the snapshot', async () => {
		const { container } = await mount(FRESH_ME)

		expect(container.firstChild).toMatchSnapshot()
	})
})

describe('AddressList rendering', () => {
	it('lists every saved address', async () => {
		await mount()

		expect(screen.getAllByRole('listitem')).toHaveLength(2)
	})

	/*
	 * ⚠️ The line above the list changes with it, and the version shown to somebody who *has* addresses is the
	 * only place the default is explained. Left on "You have no saved addresses yet." it contradicts the two
	 * cards underneath it; blanked, the "Default" badge is a word with no meaning attached and no reason for
	 * anyone to press "Make default".
	 */
	it('explains what the default is for, once there is something to default to', async () => {
		await mount()

		expect(screen.getByText('Your default address is used first when you order.')).toBeInTheDocument()
		expect(screen.queryByText('You have no saved addresses yet.')).not.toBeInTheDocument()
	})

	/*
	 * The row actions are styled as links rather than as buttons, deliberately — they sit inside a card and a
	 * row of four filled buttons reads as four equally weighted decisions. `underline` is what says they are
	 * pressable at all once the button chrome is gone, so it is asserted rather than left as decoration.
	 */
	it('marks the row actions as pressable', async () => {
		await mount()

		expect(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Edit' })).toHaveClass(
			'text-sm',
			'underline',
			'text-slate-600'
		)
	})

	it('writes each address on one line', async () => {
		await mount()

		expect(screen.getByText('1 Main Street, 02108 Boston (MA)')).toBeInTheDocument()
	})

	it('shows the name the customer gave it', async () => {
		await mount()

		expect(within(rowOf('1 Main Street')).getByText('Home')).toBeInTheDocument()
	})

	// An address with no label still needs something to head the card, or it opens with the street repeated
	// as its own title.
	it('falls back to a generic heading for an unnamed address', async () => {
		await mount()

		expect(within(rowOf('5 Oak Street')).getByText('Address')).toBeInTheDocument()
	})

	// The customer is told which addresses cannot be used for distance sorting, on the card rather than in
	// a form they would have to open first.
	it('marks an address that has no map position', async () => {
		await mount()

		expect(within(rowOf('5 Oak Street')).getByText('Not placed on the map')).toBeInTheDocument()
		expect(within(rowOf('1 Main Street')).queryByText('Not placed on the map')).not.toBeInTheDocument()
	})

	it('matches the snapshot', async () => {
		const { container } = await mount()

		expect(container.firstChild).toMatchSnapshot()
	})
})

describe('AddressList default address', () => {
	/*
	 * ⚠️ "Is this the default?" is `address._id === me.defaultAddress`, not a flag on the element. The
	 * default is a single pointer at the top of the document, which is what makes two defaults
	 * *unrepresentable* rather than merely forbidden — and it is why the badge is derived here rather than
	 * read off the address.
	 */
	it('badges exactly one address', async () => {
		await mount()

		expect(screen.getAllByText('Default')).toHaveLength(1)
		expect(within(rowOf('1 Main Street')).getByText('Default')).toBeInTheDocument()
	})

	it('badges none when no default has been named', async () => {
		await mount({ ...FULL_ME, defaultAddress: null })

		expect(screen.queryByText('Default')).not.toBeInTheDocument()
	})

	it('offers to promote only the addresses that are not the default', async () => {
		await mount()

		expect(screen.getAllByRole('button', { name: 'Make default' })).toHaveLength(1)
		expect(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Make default' })).toBeInTheDocument()
	})

	/*
	 * One atomic `$set` of the pointer, with no "clear the others" step — so there is no window in which
	 * zero or two addresses are default, and no transaction to hold one open.
	 */
	it('sets the default with a single write naming the new one', async () => {
		const { user, stub } = await mount()

		await user.click(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Make default' }))

		await waitFor(() => {
			expect(written(stub)).toHaveLength(1)
		})
		expect(written(stub)[0]?.operationName).toBe('UserDefaultAddressSet')
		expect(written(stub)[0]?.variables).toEqual({ _id: WORK_ADDRESS._id })
		expect(written(stub)[0]?.url).toBe(ENDPOINT.userResource)
		// Nothing is said about a write that worked. The list is the confirmation, and an error bar above a
		// change that went through is worse than no message at all.
		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	it('shows the message the server sent when it refuses', async () => {
		const { user } = await mount(FULL_ME, {
			UserDefaultAddressSet: { errors: [graphQLError('That address is not yours')], status: 403 }
		})

		await user.click(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Make default' }))

		expect(await screen.findByRole('alert')).toHaveTextContent('That address is not yours')
	})

	/*
	 * ⚠️ `{"data": null}` with no `errors` array is an envelope that reports nothing, and this list is the one
	 * surface with nothing else to fall back on: a form stays open on a failure and a field keeps its error,
	 * but a row that did not change looks exactly like a row that did. `messageOf` has no error to quote and
	 * answers with the empty string, which `FormStatus` renders as nothing — so without a fallback the
	 * customer clicks "Make default", sees no badge move and no explanation, and has no reason to try again.
	 */
	it('says so when the answer reported neither a payload nor an error', async () => {
		const { user } = await mount(FULL_ME, { UserDefaultAddressSet: { body: '{"data":null}' } })

		await user.click(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Make default' }))

		expect(await screen.findByRole('alert')).toHaveTextContent('That change did not go through. Try again.')
	})
})

describe('AddressList deleting', () => {
	/*
	 * Two clicks rather than `window.confirm`: a native dialog is not stylable, is blocked outright in some
	 * embedded browsers, and cannot be asserted on without stubbing a global. Making the second button
	 * state the consequence also says more than a modal reading "Are you sure?".
	 */
	it('does not delete on the first click', async () => {
		const { user, stub } = await mount()

		await user.click(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Delete' }))

		expect(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Delete for good' })).toBeInTheDocument()
		expect(written(stub)).toHaveLength(0)
	})

	it('deletes on the second', async () => {
		const { user, stub } = await mount()

		await user.click(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Delete' }))
		await user.click(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Delete for good' }))

		await waitFor(() => {
			expect(written(stub)).toHaveLength(1)
		})
		expect(written(stub)[0]?.operationName).toBe('UserAddressDel')
		expect(written(stub)[0]?.variables).toEqual({ _id: WORK_ADDRESS._id })
	})

	it('lets the customer back out', async () => {
		const { user, stub } = await mount()

		await user.click(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Delete' }))
		await user.click(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Keep it' }))

		expect(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
		expect(written(stub)).toHaveLength(0)
	})

	// The confirmation is per address, not a mode the whole list enters — otherwise a second click meant
	// for one row deletes another.
	it('asks about one address at a time', async () => {
		const { user } = await mount()

		await user.click(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Delete' }))

		expect(within(rowOf('1 Main Street')).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
		expect(screen.getAllByRole('button', { name: 'Delete for good' })).toHaveLength(1)
	})

	/*
	 * ⚠️ Deleting the default is allowed, and nothing here sequences two writes. The collection validator
	 * refuses any document whose `defaultAddress` is not one of its own `addresses[]._id`, so the server
	 * unsets the pointer in the same update — a client-side "clear the default first" step would be a
	 * second round trip that can fail on its own.
	 */
	it('deletes the default address like any other', async () => {
		const { user, stub } = await mount()

		await user.click(within(rowOf('1 Main Street')).getByRole('button', { name: 'Delete' }))
		await user.click(within(rowOf('1 Main Street')).getByRole('button', { name: 'Delete for good' }))

		await waitFor(() => {
			expect(written(stub)).toHaveLength(1)
		})
		expect(written(stub)[0]?.variables).toEqual({ _id: HOME_ADDRESS._id })
	})

	it('shows the message the server sent when it refuses', async () => {
		const { user } = await mount(FULL_ME, {
			UserAddressDel: { errors: [graphQLError('That address is in use')], status: 409 }
		})

		await user.click(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Delete' }))
		await user.click(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Delete for good' }))

		expect(await screen.findByRole('alert')).toHaveTextContent('That address is in use')
	})

	it('falls back to the generic message when the server is unreachable', async () => {
		const { user } = await mount(FULL_ME, { UserAddressDel: { networkError: 'ECONNREFUSED 127.0.0.1:4032' } })

		await user.click(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Delete' }))
		await user.click(within(rowOf('5 Oak Street')).getByRole('button', { name: 'Delete for good' }))

		expect(await screen.findByRole('alert')).toHaveTextContent('Error while communicating with the server')
	})
})

describe('AddressList adding', () => {
	it('opens an empty form', async () => {
		const { user } = await mount()

		await user.click(screen.getByRole('button', { name: 'Add an address' }))

		expect(screen.getByRole('button', { name: 'Add address' })).toBeInTheDocument()
		expect(screen.getByLabelText('Street and number')).toHaveValue('')
	})

	// One form at a time: the button that opens a second one disappears while the first is open, so there
	// is never an "Add" form above an "Edit" form both claiming to be the thing being saved.
	it('hides the opener while the form is open', async () => {
		const { user } = await mount()

		await user.click(screen.getByRole('button', { name: 'Add an address' }))

		expect(screen.queryByRole('button', { name: 'Add an address' })).not.toBeInTheDocument()
	})

	it('closes on cancel and offers to add again', async () => {
		const { user } = await mount()

		await user.click(screen.getByRole('button', { name: 'Add an address' }))
		await user.click(screen.getByRole('button', { name: 'Cancel' }))

		expect(screen.queryByLabelText('Street and number')).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Add an address' })).toBeInTheDocument()
	})

	/*
	 * The mirror of the edit form's close, and not the same code path: the add form and the edit form are two
	 * separate mounts of `AddressForm`, each handed its own `onDone`. One of them closing says nothing about
	 * the other, and an add form left open after a successful write invites the same address a second time.
	 */
	it('closes once the new address is saved', async () => {
		const { user } = await mount(FULL_ME, { ...WRITES, UserAddressAdd: { data: { userAddressAdd: true } } })

		await user.click(screen.getByRole('button', { name: 'Add an address' }))
		await user.type(screen.getByLabelText('Street and number'), '3 Elm Street')
		await user.type(screen.getByLabelText('Postal code'), '02108')
		await user.type(screen.getByLabelText('City'), 'Boston')
		await user.type(screen.getByLabelText('Province'), 'MA')
		await user.click(screen.getByRole('button', { name: 'Add address' }))

		await waitFor(() => {
			expect(screen.queryByLabelText('Street and number')).not.toBeInTheDocument()
		})
		expect(screen.getByRole('button', { name: 'Add an address' })).toBeInTheDocument()
	})

	it('keeps the saved addresses listed underneath', async () => {
		const { user } = await mount()

		await user.click(screen.getByRole('button', { name: 'Add an address' }))

		expect(screen.getAllByRole('listitem')).toHaveLength(2)
	})
})

describe('AddressList at the six-address cap', () => {
	const CAP_LINE = 'You have saved the most addresses an account can hold (6). Delete one to add another.'

	/**
	 * Its own mount, because `mount` above waits for the "Add an address" button and that button is
	 * exactly what a full address book does not have. The wait is on the line that replaces it.
	 */
	const mountCapped = async (me = CAPPED_ME) => {
		const rendered = await renderInAccount(<AddressList />, { me, replies: WRITES, path: '/account/addresses' })

		await screen.findByText(CAP_LINE)

		return { ...rendered, user: userEvent.setup() }
	}

	it('lists all six', async () => {
		await mountCapped()

		expect(screen.getAllByRole('listitem')).toHaveLength(6)
	})

	// The courtesy, not the enforcement: the server refuses the seventh whatever this screen shows. What
	// hiding the opener buys is a customer not filling in a form that cannot be submitted.
	it('stops offering to add another', async () => {
		await mountCapped()

		expect(screen.queryByRole('button', { name: 'Add an address' })).not.toBeInTheDocument()
	})

	/*
	 * ⚠️ The line and the missing button are one change, and the line is the half that can be dropped
	 * without anything looking broken. A control that vanishes with no sentence beside it reads as a bug,
	 * and "delete one first" is not guessable from an absence — so the text is asserted whole, the number
	 * included, rather than by a substring that would survive the limit being renamed.
	 */
	it('says why, and names the number', async () => {
		await mountCapped()

		expect(screen.getByText(CAP_LINE)).toBeInTheDocument()
		expect(screen.queryByText('Your default address is used first when you order.')).not.toBeInTheDocument()
	})

	// The boundary, and the reason it is a test of its own: five is a full-looking address book that must
	// still offer the sixth. An off-by-one here costs every customer their last address.
	it('still offers the sixth when five are saved', async () => {
		const five = { ...CAPPED_ME, addresses: CAPPED_ME.addresses.slice(0, 5) }
		await renderInAccount(<AddressList />, { me: five, replies: WRITES, path: '/account/addresses' })

		expect(await screen.findByRole('button', { name: 'Add an address' })).toBeInTheDocument()
		expect(screen.getByText('Your default address is used first when you order.')).toBeInTheDocument()
	})

	it('matches the snapshot', async () => {
		const { container } = await mountCapped()

		expect(container.firstChild).toMatchSnapshot()
	})
})

describe('AddressList editing', () => {
	it('opens the form filled in with that address', async () => {
		const { user } = await mount()

		await user.click(within(rowOf('1 Main Street')).getByRole('button', { name: 'Edit' }))

		expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
		expect(screen.getByLabelText('Street and number')).toHaveValue('1 Main Street')
	})

	// The card is replaced by the form rather than sitting above it: two copies of the same address, one
	// editable and one not, is a question about which of them is the real one.
	it('replaces the card it is editing', async () => {
		const { user } = await mount()

		await user.click(within(rowOf('1 Main Street')).getByRole('button', { name: 'Edit' }))

		expect(screen.queryByText('1 Main Street, 02108 Boston (MA)')).not.toBeInTheDocument()
	})

	it('leaves the other addresses alone', async () => {
		const { user } = await mount()

		await user.click(within(rowOf('1 Main Street')).getByRole('button', { name: 'Edit' }))

		expect(screen.getByText('5 Oak Street, 02115 Boston (MA)')).toBeInTheDocument()
	})

	it('closes on cancel and shows the card again', async () => {
		const { user } = await mount()

		await user.click(within(rowOf('1 Main Street')).getByRole('button', { name: 'Edit' }))
		await user.click(screen.getByRole('button', { name: 'Cancel' }))

		expect(screen.getByText('1 Main Street, 02108 Boston (MA)')).toBeInTheDocument()
	})

	it('closes once the change is saved', async () => {
		const { user } = await mount(FULL_ME, {
			...WRITES,
			UserAddressUpdate: { data: { userAddressUpdate: true } }
		})

		await user.click(within(rowOf('1 Main Street')).getByRole('button', { name: 'Edit' }))
		await user.click(screen.getByRole('button', { name: 'Save changes' }))

		await waitFor(() => {
			expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
		})
	})
})
