import { z } from 'zod'

import { env } from '@/env'

/**
 * Address geocoding, against the **on-premises** Nominatim.
 *
 * ⚠️ This is the one substantive difference from `marketplace-shopowner`'s copy of this file, and it is
 * not an optimisation. That one calls `https://nominatim.openstreetmap.org` directly, which is a free
 * service on donated hardware with a usage policy of at most one request per second and no bulk
 * querying. Two internal panels with a handful of operators fit inside that. A public site sized for
 * 500 000 registered customers does not — it is a policy breach at any traffic worth having, and the
 * enforcement is an IP block, not a throttle. `VITE_NOMINATIM_URL` points at the local instance;
 * `docs/nominatim/README.md` is its setup.
 *
 * The default is the root-relative `/nominatim`, so the request is same-origin and nginx proxies it.
 * That keeps the instance off the public internet: it has no rate limiting of its own, and an open one
 * is a free geocoding API for everyone who finds it.
 *
 * There is no map-embed helper here. The sibling apps frame a point with OpenStreetMap's
 * `export/embed.html` iframe, which shows exactly one pin; this app renders vector tiles with MapLibre
 * and needs to draw thousands. See `src/features/map/`.
 */

/** Nominatim's own cap is 50; five is what fits under a text field without becoming a page. */
export const MAX_RESULTS = 5

/**
 * The province is read from `ISO3166-2-lvl6`, not from `county`.
 *
 * Level 6 is the Italian province and its value is already the code the form wants, prefixed with the
 * country: `IT-MI`. `county` is the province's *name*, and it arrives spelled in whichever way the
 * mappers wrote it — `Milano`, `Città Metropolitana di Milano` — with no way to reach `MI` from it.
 */
const ISO_PROVINCE = 'ISO3166-2-lvl6'

/**
 * A city is tagged by size, not by role: a city is `city`, a small town `town`, a village `village`.
 * One of the three is present, never more than one, and which one is not something an address form can
 * care about.
 */
const CITY_KEYS = ['city', 'town', 'village'] as const

/**
 * Every field defaults to the empty string because `addressdetails` omits what it does not know rather
 * than sending it null — a rural address has no `house_number` key at all. Unknown keys are dropped:
 * zod objects strip by default, and Nominatim sends a dozen this form has no use for.
 */
const addressSchema = z.object({
	road: z.string().default(''),
	house_number: z.string().default(''),
	postcode: z.string().default(''),
	city: z.string().default(''),
	town: z.string().default(''),
	village: z.string().default(''),
	[ISO_PROVINCE]: z.string().default('')
})

/** `lat` and `lon` arrive as strings — `"45.4642035"` — which is why they are coerced and not declared numeric. */
const resultSchema = z.object({
	place_id: z.coerce.string(),
	display_name: z.string(),
	lat: z.coerce.number(),
	lon: z.coerce.number(),
	address: addressSchema.optional()
})

const responseSchema = z.array(resultSchema)

/** The shape an empty `address` parses to, so the mapping below has no undefined to branch on. */
const EMPTY_ADDRESS = addressSchema.parse({})

/** One geocoded address, flattened into the fields `GraphQLInputUserAddress` carries. */
export interface FoundAddress {
	/** Nominatim's own id for the place — a stable React key, and nothing else. */
	readonly id: string
	/** The full one-line address, as OSM writes it. What the suggestion list shows. */
	readonly label: string
	/** Street and house number, in Italian order: `Via Roma 1`. */
	readonly street: string
	readonly postalCode: string
	readonly city: string
	/** The two-letter province code, upper-case: `MI`. Empty when OSM has no province for the point. */
	readonly province: string
	readonly lat: number
	readonly lon: number
}

type AddressOsm = z.infer<typeof addressSchema>

const cityOf = (address: AddressOsm): string => CITY_KEYS.map((key) => address[key]).find((value) => value !== '') ?? ''

const map = (result: z.infer<typeof resultSchema>): FoundAddress => {
	const address = result.address ?? EMPTY_ADDRESS

	return {
		id: result.place_id,
		label: result.display_name,
		// Filtered before joining: a road with no house number must not come back with a trailing space,
		// and a point with neither must be the empty string the form treats as "nothing found".
		street: [address.road, address.house_number].filter((part) => part !== '').join(' '),
		postalCode: address.postcode,
		city: cityOf(address),
		// `IT-MI` → `MI`. An absent code is the empty string, and `''.slice(-2)` is `''`.
		province: address[ISO_PROVINCE].slice(-2),
		lat: result.lat,
		lon: result.lon
	}
}

/**
 * Geocodes free text.
 *
 * Restricted to Italy: every field around it — a five-digit postal code, a two-letter province — is an
 * Italian address, so a Roman street in Texas is noise the customer has to read past. `signal` is
 * required rather than optional because the caller types faster than the network answers, and an
 * unaborted earlier request can land after a later one and overwrite the newer suggestions with older
 * ones.
 *
 * Throws on anything that is not a well-formed answer. There is nothing useful a caller could do with a
 * partial one, and the field reports the failure rather than silently showing no matches — which reads
 * as "this address does not exist".
 */
export const searchAddresses = async (query: string, signal: AbortSignal): Promise<FoundAddress[]> => {
	const params = new URLSearchParams({
		q: query,
		format: 'jsonv2',
		addressdetails: '1',
		limit: String(MAX_RESULTS),
		countrycodes: 'it',
		'accept-language': 'it'
	})

	const response = await fetch(`${env.nominatimUrl}/search?${params.toString()}`, { signal })
	if (!response.ok) throw new Error(`Geocoder answered ${String(response.status)}`)

	return responseSchema.parse(await response.json()).map(map)
}
