import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import type { MeAddress } from '@/features/account/AccountGate'
import { AddressForm } from '@/features/account/AddressForm'

import type { GraphQLReplies, GraphQLStub } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { HOME_ADDRESS, WORK_ADDRESS } from '../../helpers/me'
import type { ResponseOsm } from '../../helpers/nominatim'
import { osmStub, resultOsm } from '../../helpers/nominatim'
import { PIN_DROPPED_TEXT } from '../../helpers/positionPicker'
import { CUSTOMER_EMAIL, renderWithClient } from '../../helpers/render'

/*
 * ⚠️ The map is stubbed, and it has to be: MapLibre reaches for a WebGL context jsdom does not have, so the
 * real island tears this form down on the effect that builds the map. What is asserted here is the wiring
 * between the form and the map — the pair handed over, the point handed back — and the map itself is tested
 * in `test/features/map/`.
 */
vi.mock('@/features/map/PositionPickerIsland', async () => (await import('../../helpers/positionPicker')).positionPickerStub())

const ADDED: GraphQLReplies = { UserAddressAdd: { data: { userAddressAdd: true } } }
const UPDATED: GraphQLReplies = { UserAddressUpdate: { data: { userAddressUpdate: true } } }

interface MountOptions {
	address?: MeAddress
	replies?: GraphQLReplies
	osm?: ResponseOsm | readonly ResponseOsm[]
}

const mount = ({ address, replies = ADDED, osm = {} }: MountOptions = {}) => {
	const onDone = vi.fn()
	const onCancel = vi.fn()
	const geocoder = osmStub(osm)
	const stub = stubGraphQL(replies, geocoder.rest)

	const props = address === undefined ? { onDone, onCancel } : { address, onDone, onCancel }
	const result = renderWithClient(<AddressForm {...props} />, { token: 'access-token', session: CUSTOMER_EMAIL })

	return { ...result, stub, geocoder, onDone, onCancel, user: userEvent.setup() }
}

const VALID = { street: '5 Oak Street', postalCode: '02115', city: 'Boston', province: 'MA' } as const

// `Record<…, string>` rather than `Partial<typeof VALID>`: the fixture is `as const`, so a partial of it
// accepts only the exact strings it already holds — and every override here exists to type a different one.
const fillIn = async (user: ReturnType<typeof userEvent.setup>, over: Partial<Record<keyof typeof VALID, string>> = {}) => {
	const values = { ...VALID, ...over }

	await user.type(screen.getByLabelText('Street and number'), values.street)
	await user.type(screen.getByLabelText('Postal code'), values.postalCode)
	await user.type(screen.getByLabelText('City'), values.city)
	await user.type(screen.getByLabelText('Province'), values.province)
}

const submit = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
	await user.click(screen.getByRole('button', { name }))
}

const written = (stub: GraphQLStub) => stub.calls.find((call) => call.operationName.startsWith('UserAddress'))

const addressOf = (stub: GraphQLStub) => written(stub)?.variables.address as Record<string, unknown> | undefined

describe('AddressForm adding', () => {
	it('opens empty', () => {
		mount()

		expect(screen.getByLabelText('Street and number')).toHaveValue('')
		expect(screen.getByLabelText('City')).toHaveValue('')
	})

	it('names its action for what it does', () => {
		mount()

		expect(screen.getByRole('button', { name: 'Add address' })).toBeInTheDocument()
	})

	it('sends the fields to the user resource service', async () => {
		const { user, stub } = mount()

		await fillIn(user)
		await submit(user, 'Add address')

		await waitFor(() => {
			expect(written(stub)?.operationName).toBe('UserAddressAdd')
		})
		expect(written(stub)?.url).toBe(ENDPOINT.userResource)
		expect(addressOf(stub)).toMatchObject(VALID)
	})

	// The add mutation takes an address and nothing else; an `_id` here is the caller confusing the two.
	it('sends no id', async () => {
		const { user, stub } = mount()

		await fillIn(user)
		await submit(user, 'Add address')

		await waitFor(() => {
			expect(written(stub)).toBeDefined()
		})
		expect(written(stub)?.variables._id).toBeUndefined()
	})

	it('matches the snapshot', () => {
		const { container } = mount()

		expect(container.firstChild).toMatchSnapshot()
	})
})

describe('AddressForm editing', () => {
	it('opens with the stored address', () => {
		mount({ address: HOME_ADDRESS, replies: UPDATED })

		expect(screen.getByLabelText('Name this address')).toHaveValue('Home')
		expect(screen.getByLabelText('Street and number')).toHaveValue('1 Main Street')
		expect(screen.getByLabelText('Postal code')).toHaveValue('02108')
		expect(screen.getByLabelText('City')).toHaveValue('Boston')
		expect(screen.getByLabelText('Province')).toHaveValue('MA')
	})

	it('names its action for what it does', () => {
		mount({ address: HOME_ADDRESS, replies: UPDATED })

		expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
	})

	it('sends the update with the id of the address being edited', async () => {
		const { user, stub } = mount({ address: HOME_ADDRESS, replies: UPDATED })

		await submit(user, 'Save changes')

		await waitFor(() => {
			expect(written(stub)?.operationName).toBe('UserAddressUpdate')
		})
		expect(written(stub)?.variables._id).toBe(HOME_ADDRESS._id)
	})

	// An unlabelled address is `label: null`, and a controlled input handed null becomes uncontrolled and
	// warns. `''` is the empty field a customer can then type into.
	it('shows an empty box for an address that was never named', () => {
		mount({ address: WORK_ADDRESS, replies: UPDATED })

		expect(screen.getByLabelText('Name this address')).toHaveValue('')
	})

	it('matches the snapshot', () => {
		const { container } = mount({ address: HOME_ADDRESS, replies: UPDATED })

		expect(container.firstChild).toMatchSnapshot()
	})
})

describe('AddressForm position', () => {
	/*
	 * ⚠️ GeoJSON is `[longitude, latitude]`, the reverse of how every map UI, every URL and every human
	 * says it. Swapping them does not throw — `[42.36, -71.06]` is a valid point, it is simply in the Southern Ocean —
	 * and the `2dsphere` index then answers "no shops near you" forever. Boston is 71.06 W, 42.36 N, so the
	 * pair below is wrong in the only way that matters if the order is ever "tidied up".
	 */
	it('sends longitude first', async () => {
		const { user, stub } = mount({ address: HOME_ADDRESS, replies: UPDATED })

		await submit(user, 'Save changes')

		await waitFor(() => {
			expect(addressOf(stub)?.position).toEqual({ coordinates: [-71.0589, 42.3601] })
		})
	})

	it('says the address is placed when it is', () => {
		mount({ address: HOME_ADDRESS, replies: UPDATED })

		expect(screen.getByText(/sort shops by how close they are/)).toBeInTheDocument()
	})

	/*
	 * A hand-typed address the geocoder does not know is still saved — one that cannot be sorted by
	 * distance, which is a smaller loss than refusing to store where the customer lives.
	 */
	it('saves an address with no position at all', async () => {
		const { user, stub } = mount({ address: WORK_ADDRESS, replies: UPDATED })

		await submit(user, 'Save changes')

		await waitFor(() => {
			expect(written(stub)).toBeDefined()
		})
		expect(addressOf(stub)?.position).toBeUndefined()
	})

	it('says so, so the customer knows what they are giving up', () => {
		mount({ address: WORK_ADDRESS, replies: UPDATED })

		expect(screen.getByText(/no map position yet/)).toBeInTheDocument()
	})

	/*
	 * ⚠️ Half a position is not a degraded position, it is a wrong one. `[Float!]!` is what the resolver
	 * declares, so a one-entry array is a shape the wire can carry, and the two ways of "completing" it are
	 * both worse than dropping it: a `NaN` latitude is rejected by the `2dsphere` index on write, and a
	 * zero puts the customer in the Gulf of Guinea, where nothing is near anything. Dropped and said so,
	 * which leaves them able to fix it by picking a suggestion.
	 */
	it.each([
		['one coordinate', [-71.0589]],
		['none at all', []]
	])('treats a position of %s as no position at all', async (_label, coordinates) => {
		const { user, stub } = mount({
			address: { ...HOME_ADDRESS, position: { type: 'Point', coordinates } },
			replies: UPDATED
		})

		expect(screen.getByText(/no map position yet/)).toBeInTheDocument()

		await submit(user, 'Save changes')

		await waitFor(() => {
			expect(written(stub)).toBeDefined()
		})
		expect(addressOf(stub)?.position).toBeUndefined()
	})

	it('sends no position for a hand-typed new address', async () => {
		const { user, stub } = mount()

		await fillIn(user)
		await submit(user, 'Add address')

		await waitFor(() => {
			expect(written(stub)).toBeDefined()
		})
		expect(addressOf(stub)?.position).toBeUndefined()
	})
})

describe('AddressForm geocoder', () => {
	const pick = async (user: ReturnType<typeof userEvent.setup>) => {
		await user.type(screen.getByLabelText('Find your address'), '1 Main Street')
		await user.click(await screen.findByRole('button', { name: /Main Street, 1, Boston/ }))
	}

	it('fills the fields from the suggestion', async () => {
		const { user } = mount({ osm: { results: [resultOsm()] } })

		await pick(user)

		expect(screen.getByLabelText('Street and number')).toHaveValue('1 Main Street')
		expect(screen.getByLabelText('Postal code')).toHaveValue('02108')
		expect(screen.getByLabelText('City')).toHaveValue('Boston')
		expect(screen.getByLabelText('Province')).toHaveValue('MA')
	})

	// ⚠️ Nominatim answers named `lat`/`lon` fields; GeoJSON wants an array with longitude first. The
	// conversion happens once, here at the boundary, and this is the assertion that pins the order.
	it('stores the coordinates in GeoJSON order', async () => {
		const { user, stub } = mount({ osm: { results: [resultOsm()] } })

		await pick(user)
		await submit(user, 'Add address')

		await waitFor(() => {
			expect(addressOf(stub)?.position).toEqual({ coordinates: [-71.0589, 42.3601] })
		})
	})

	it('reports the address as placed once a suggestion is picked', async () => {
		const { user } = mount({ osm: { results: [resultOsm()] } })

		expect(screen.getByText(/no map position yet/)).toBeInTheDocument()

		await pick(user)

		expect(screen.getByText(/sort shops by how close they are/)).toBeInTheDocument()
	})

	/*
	 * `shouldValidate` on every `setValue`: a field the geocoder has just corrected must drop the error it
	 * was showing, rather than keeping it until the customer blurs a field they never touched.
	 */
	it('clears the error on a field the geocoder just corrected', async () => {
		const { user } = mount({ osm: { results: [resultOsm()] } })

		await submit(user, 'Add address')
		expect(await screen.findByText('Street is required.')).toBeInTheDocument()

		await pick(user)

		await waitFor(() => {
			expect(screen.queryByText('Street is required.')).not.toBeInTheDocument()
		})
	})
})

describe('AddressForm validation', () => {
	it('requires a street and a city', async () => {
		const { user, stub } = mount()

		await submit(user, 'Add address')

		expect(await screen.findByText('Street is required.')).toBeInTheDocument()
		expect(screen.getByText('City is required.')).toBeInTheDocument()
		expect(written(stub)).toBeUndefined()
	})

	// Five digits exactly, and a string rather than a number: `00187` parsed as a number is 187, and there
	// is no way back from that.
	it.each([
		['four digits', '2012'],
		['six digits', '201234'],
		['letters', '2012A']
	])('refuses a postal code of %s', async (_label, postalCode) => {
		const { user, stub } = mount()

		await fillIn(user, { postalCode })
		await submit(user, 'Add address')

		expect(await screen.findByText('A postal code is five digits.')).toBeInTheDocument()
		expect(written(stub)).toBeUndefined()
	})

	it('keeps a leading zero, because a postal code is not a number', async () => {
		const { user, stub } = mount()

		await fillIn(user, { postalCode: '00187' })
		await submit(user, 'Add address')

		await waitFor(() => {
			expect(addressOf(stub)?.postalCode).toBe('00187')
		})
	})

	it('refuses a province that is not two letters', async () => {
		const { user, stub } = mount()

		await fillIn(user, { province: 'M' })
		await submit(user, 'Add address')

		expect(await screen.findByText('A province is two letters, like MA.')).toBeInTheDocument()
		expect(written(stub)).toBeUndefined()
	})

	/*
	 * ⚠️ Both ends of `/^[A-Z]{2}$/` are load-bearing, and neither can be reached by typing: the field carries
	 * `maxLength={2}`, which `user.type` honours. `maxlength` is not a validation boundary though — browser
	 * autofill writes past it, so does an IME composition, and so does `setValue` from the geocoder — which
	 * is why the schema repeats the limit and why these two go in through a change event rather than a
	 * keystroke.
	 *
	 * Losing `$` accepts `MAS` and stores `MA`-plus-something; losing `^` accepts `1MA`. Both are a province
	 * code that matches nothing on an equality filter, in a field the customer cannot see is wrong.
	 */
	it.each([
		['trailing rubbish', 'MAS'],
		['a leading digit', '1MA']
	])('refuses a province with %s, however it got into the field', async (_label, province) => {
		const { user, stub } = mount()

		await fillIn(user)
		fireEvent.change(screen.getByLabelText('Province'), { target: { value: province } })
		await submit(user, 'Add address')

		expect(await screen.findByText('A province is two letters, like MA.')).toBeInTheDocument()
		expect(written(stub)).toBeUndefined()
	})

	// Autofill again — it pads with spaces often enough that a province arrives as `" mi "`. Trimmed before
	// the pattern runs, so it is stored rather than rejected for whitespace the customer never typed.
	it('trims a province that arrived padded', async () => {
		const { user, stub } = mount()

		await fillIn(user)
		fireEvent.change(screen.getByLabelText('Province'), { target: { value: ' ma ' } })
		await submit(user, 'Add address')

		await waitFor(() => {
			expect(addressOf(stub)?.province).toBe('MA')
		})
	})

	// Typed in lower case and stored upper: the province code is `MA`, and a `ma` in the database is a
	// second spelling of the same province that no equality filter will match.
	it('upper-cases the province before sending it', async () => {
		const { user, stub } = mount()

		await fillIn(user, { province: 'ma' })
		await submit(user, 'Add address')

		await waitFor(() => {
			expect(addressOf(stub)?.province).toBe('MA')
		})
	})

	/*
	 * ⚠️ Every text field trims, and each one has to be checked on its own — they are five separate schema
	 * entries, not one shared rule. Untrimmed, the two that carry a pattern (`postalCode`, `province`) reject
	 * a value the customer will swear they typed correctly, and the three that do not (`label`, `street`,
	 * `city`) store the padding: `" Boston "` is a second city as far as any equality filter is concerned,
	 * and the address it belongs to sorts and groups on its own forever.
	 */
	it.each([
		['Street and number', 'street', '  5 Oak Street  ', '5 Oak Street'],
		['City', 'city', '  Boston  ', 'Boston'],
		['Postal code', 'postalCode', '  02115  ', '02115']
	])('trims %s rather than storing the spaces', async (label, key, typed, stored) => {
		const { user, stub } = mount()

		await fillIn(user)
		await user.clear(screen.getByLabelText(label))
		await user.type(screen.getByLabelText(label), typed)
		await submit(user, 'Add address')

		await waitFor(() => {
			expect(addressOf(stub)?.[key]).toBe(stored)
		})
	})

	it('trims the label too, so a name of spaces is no name', async () => {
		const { user, stub } = mount()

		await user.type(screen.getByLabelText('Name this address'), '  Work  ')
		await fillIn(user)
		await submit(user, 'Add address')

		await waitFor(() => {
			expect(addressOf(stub)?.label).toBe('Work')
		})
	})

	it('caps the label at fifty characters', async () => {
		const { user, stub } = mount()

		await user.type(screen.getByLabelText('Name this address'), 'a'.repeat(51))
		await fillIn(user)
		await submit(user, 'Add address')

		expect(await screen.findByText('Use at most 50 characters.')).toBeInTheDocument()
		expect(written(stub)).toBeUndefined()
	})

	/*
	 * The two long fields have their own caps and their own messages. A shared "too long" would be wrong in
	 * both directions here — 250 characters of street is a legitimate address with a hamlet name in
	 * it, while 250 of city is a paste accident — so the number in each message has to name its own field's
	 * limit, and only the field it belongs to can prove it.
	 */
	it.each([
		['Street and number', 251, 'Use at most 250 characters.'],
		['City', 101, 'Use at most 100 characters.']
	])('caps %s and says by how much', async (label, length, message) => {
		const { user, stub } = mount()

		await fillIn(user)
		await user.clear(screen.getByLabelText(label))
		await user.type(screen.getByLabelText(label), 'a'.repeat(length))
		await submit(user, 'Add address')

		expect(await screen.findByText(message)).toBeInTheDocument()
		expect(written(stub)).toBeUndefined()
	})
})

describe('AddressForm label', () => {
	/*
	 * ⚠️ An empty label is *no* label, not an empty one. `''` would be stored and would come back as an
	 * address named after nothing; `undefined` omits the key, and the list then falls back to the word
	 * "Address" it uses for every unnamed one.
	 */
	it('omits a label that was left blank', async () => {
		const { user, stub } = mount()

		await fillIn(user)
		await submit(user, 'Add address')

		await waitFor(() => {
			expect(written(stub)).toBeDefined()
		})
		expect(addressOf(stub)?.label).toBeUndefined()
	})

	it('sends the label when there is one', async () => {
		const { user, stub } = mount()

		await user.type(screen.getByLabelText('Name this address'), 'Work')
		await fillIn(user)
		await submit(user, 'Add address')

		await waitFor(() => {
			expect(addressOf(stub)?.label).toBe('Work')
		})
	})
})

describe('AddressForm result', () => {
	it('tells the list it is finished', async () => {
		const { user, onDone } = mount()

		await fillIn(user)
		await submit(user, 'Add address')

		await waitFor(() => {
			expect(onDone).toHaveBeenCalledTimes(1)
		})
	})

	it('says what it is doing while it waits', async () => {
		const { user } = mount({ replies: { UserAddressAdd: { pending: true } } })

		await fillIn(user)
		await submit(user, 'Add address')

		expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled()
	})

	it('shows the message the server sent when it refuses', async () => {
		const { user } = mount({
			replies: { UserAddressAdd: { errors: [graphQLError('That address already exists')], status: 400 } }
		})

		await fillIn(user)
		await submit(user, 'Add address')

		expect(await screen.findByRole('alert')).toHaveTextContent('That address already exists')
	})

	// The form stays open on a failure, with everything still in it — closing it would throw away an
	// address the customer typed because the server was busy for a second.
	it('keeps the form open and filled when the write fails', async () => {
		const { user, onDone } = mount({
			replies: { UserAddressAdd: { errors: [graphQLError('Nope')], status: 400 } }
		})

		await fillIn(user)
		await submit(user, 'Add address')

		await screen.findByRole('alert')
		expect(onDone).not.toHaveBeenCalled()
		expect(screen.getByLabelText('Street and number')).toHaveValue('5 Oak Street')
	})

	it('falls back to the generic message when the server is unreachable', async () => {
		const { user } = mount({ replies: { UserAddressAdd: { networkError: 'ECONNREFUSED 127.0.0.1:4032' } } })

		await fillIn(user)
		await submit(user, 'Add address')

		expect(await screen.findByRole('alert')).toHaveTextContent('Error while communicating with the server')
	})

	// A body that is a GraphQL envelope with neither data nor errors — a proxy page, say. There is nothing
	// to quote, and the form must not report a success it did not get.
	it('treats an answer with no data as a failure', async () => {
		const { user, onDone } = mount({ replies: { UserAddressAdd: { body: '{}' } } })

		await fillIn(user)
		await submit(user, 'Add address')

		expect(await screen.findByRole('alert')).toBeInTheDocument()
		expect(onDone).not.toHaveBeenCalled()
	})
})

describe('AddressForm cancelling', () => {
	it('closes without writing anything', async () => {
		const { user, stub, onCancel, onDone } = mount()

		await fillIn(user)
		await user.click(screen.getByRole('button', { name: 'Cancel' }))

		expect(onCancel).toHaveBeenCalledTimes(1)
		expect(onDone).not.toHaveBeenCalled()
		expect(written(stub)).toBeUndefined()
	})

	// `type="button"`: inside a `<form>`, a button with no type is a submit button, and cancelling would
	// send the very write it is there to avoid.
	it('does not submit the form on its way out', async () => {
		mount()

		expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('type', 'button')
	})
})

describe('AddressForm map', () => {
	const dropPin = async (user: ReturnType<typeof userEvent.setup>) => {
		await user.click(screen.getByRole('button', { name: 'Drop the pin' }))
	}

	const pinnedAt = () => screen.getByTestId('picker-position').textContent

	it('shows the stored address on the map', () => {
		mount({ address: HOME_ADDRESS, replies: UPDATED })

		expect(pinnedAt()).toBe('-71.0589,42.3601')
	})

	it('shows a map with no pin on it when the address has no position', () => {
		mount({ address: WORK_ADDRESS, replies: UPDATED })

		expect(pinnedAt()).toBe('nowhere')
	})

	it('moves the pin to a suggestion the moment it is picked', async () => {
		const { user } = mount({ osm: { results: [resultOsm()] } })

		expect(pinnedAt()).toBe('nowhere')

		await user.type(screen.getByLabelText('Find your address'), '1 Main Street')
		await user.click(await screen.findByRole('button', { name: /Main Street, 1, Boston/ }))

		expect(pinnedAt()).toBe('-71.0589,42.3601')
	})

	/*
	 * ⚠️ The whole reason the map is here. A hand-typed address is one the geocoder has never heard of — a
	 * new building, a rural road — and dropping a pin on it is the only way it is ever placed, which is what
	 * lets shops be sorted by distance from it.
	 *
	 * Longitude first, and rounded: a pin answers a full double, and every digit past the sixth is finer than
	 * a tenth of a metre.
	 */
	it('stores a pin dropped on the map, longitude first and rounded', async () => {
		const { user, stub } = mount()

		await fillIn(user)
		await dropPin(user)
		await submit(user, 'Add address')

		await waitFor(() => {
			expect(addressOf(stub)?.position).toEqual({ coordinates: [-71.058931, 42.360157] })
		})
	})

	it('reports the address as placed once the pin is down', async () => {
		const { user } = mount()

		expect(screen.getByText(/no map position yet/)).toBeInTheDocument()

		await dropPin(user)

		expect(screen.getByText(/sort shops by how close they are/)).toBeInTheDocument()
		expect(pinnedAt()).toBe(PIN_DROPPED_TEXT)
	})

	it('offers nothing to remove while there is no position', () => {
		mount({ address: WORK_ADDRESS, replies: UPDATED })

		expect(screen.queryByRole('button', { name: 'Remove position' })).not.toBeInTheDocument()
	})

	it('offers to remove a position once there is one', () => {
		mount({ address: HOME_ADDRESS, replies: UPDATED })

		expect(screen.getByRole('button', { name: 'Remove position' })).toBeInTheDocument()
	})

	/*
	 * Removing a position leaves the address, not the other way round: the position is optional at every
	 * layer — the form, the mutation input and the collection validator — and a customer who cannot vouch
	 * for a point is better off with none, because distance sorting believes whatever is stored.
	 */
	it('removes the position and saves the address without one', async () => {
		const { user, stub, container } = mount({ address: HOME_ADDRESS, replies: UPDATED })

		await user.click(screen.getByRole('button', { name: 'Remove position' }))

		expect(pinnedAt()).toBe('nowhere')
		expect(screen.getByText(/no map position yet/)).toBeInTheDocument()
		// ⚠️ The field itself, not only what is drawn from it: anything that is not two numbers reads as "no
		// position" everywhere on this form, so a control that wrote rubbish into it would look identical
		// here and be sent to the server on the next edit.
		expect(container.querySelector('input[type="hidden"]')).toHaveValue('')

		await submit(user, 'Save changes')

		await waitFor(() => {
			expect(written(stub)).toBeDefined()
		})
		expect(addressOf(stub)?.position).toBeUndefined()
	})

	// `type="button"`: inside a `<form>`, a button with no type is a submit button, and removing the position
	// would send the write it is there to prepare.
	it('does not submit the form on its way out', () => {
		mount({ address: HOME_ADDRESS, replies: UPDATED })

		expect(screen.getByRole('button', { name: 'Remove position' })).toHaveAttribute('type', 'button')
	})
})
