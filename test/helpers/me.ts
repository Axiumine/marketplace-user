import type { GraphQLReplies } from './graphql'
import { CUSTOMER_EMAIL } from './render'

/**
 * The `me` payload the private area is built on, and the seams that matter in it.
 *
 * ⚠️ Three fields are nullable on a real account and every one of them is a state a customer genuinely
 * sits in, not a loading artefact: `personalData` is null until the form below fills it in (registration
 * takes an email and a password and nothing else), `addresses` is empty until one is added, and
 * `defaultAddress` is null until one is named. A fixture that filled all three would never exercise the
 * branches the account screens spend most of their code on.
 */
export interface AddressFixture {
	_id: string
	label: string | null
	street: string
	postalCode: string
	city: string
	province: string
	/**
	 * `coordinates` is a plain array and not a `[number, number]` tuple, matching the schema rather than the
	 * intent: `[Float!]!` is what the resolver declares, so a one-entry position is a shape the wire can
	 * carry and the screens have to survive. A tuple here would make that fixture unwritable.
	 */
	position: { type: 'Point'; coordinates: number[] } | null
}

/** ⚠️ `[longitude, latitude]` — GeoJSON order, the reverse of how a map UI and every human says it. */
export const HOME_ADDRESS: AddressFixture = {
	_id: '66b0000000000000000000a1',
	label: 'Home',
	street: 'Via Roma 1',
	postalCode: '20121',
	city: 'Milano',
	province: 'MI',
	position: { type: 'Point', coordinates: [9.1895, 45.4642] }
}

/** Hand-typed: no geocoder match, so no position. It is still a saved address. */
export const WORK_ADDRESS: AddressFixture = {
	_id: '66b0000000000000000000a2',
	label: null,
	street: 'Via Dante 5',
	postalCode: '20123',
	city: 'Milano',
	province: 'MI',
	position: null
}

export interface MeFixture {
	_id: string
	email: string
	registeredAt: string
	defaultAddress: string | null
	personalData: {
		firstName: string
		lastName: string
		birth: { date: string } | null
		contacts: { mobile: string | null; landline: string | null; email: string | null } | null
	} | null
	addresses: AddressFixture[]
}

/** A fresh account: confirmed email, nothing else filled in yet. */
export const FRESH_ME: MeFixture = {
	_id: '66b0000000000000000000c1',
	email: CUSTOMER_EMAIL,
	registeredAt: '2026-08-05T09:00:00.000Z',
	defaultAddress: null,
	personalData: null,
	addresses: []
}

/**
 * A name and nothing else — which is exactly what `PersonalDataForm` writes when the optional fields are
 * left blank, so it is the shape the *next* load of that form gets back.
 *
 * ⚠️ `birth` and `contacts` come back **null**, not absent. Every read of a contact is therefore two hops
 * through a nullable — `personalData` may be null, and so may each of its two subdocuments — and a screen
 * that optional-chains only the first hop throws on this account while working perfectly on both others.
 */
export const NAMED_ONLY_ME: MeFixture = {
	...FRESH_ME,
	personalData: { firstName: 'Giulia', lastName: 'Rossi', birth: null, contacts: null }
}

/** An account in use: details filled in, two addresses, the first of them the default. */
export const FULL_ME: MeFixture = {
	...FRESH_ME,
	defaultAddress: HOME_ADDRESS._id,
	personalData: {
		firstName: 'Giulia',
		lastName: 'Rossi',
		birth: { date: '1990-04-17T00:00:00.000Z' },
		contacts: { mobile: '3331234567', landline: null, email: 'orders@marketplace.it' }
	},
	addresses: [HOME_ADDRESS, WORK_ADDRESS]
}

export const meReply = (me: MeFixture = FULL_ME): GraphQLReplies => ({ Me: { data: { me } } })
