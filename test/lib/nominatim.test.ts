import { describe, expect, it } from 'vitest'

import { MAX_RESULTS, searchAddresses } from '@/lib/nominatim'

import { installOsm, NOMINATIM_SEARCH, resultOsm } from '../helpers/nominatim'

/** A signal that is never aborted, for the cases that are not about abandoning a request. */
const live = (): AbortSignal => new AbortController().signal

const search = (query = 'via roma 1', signal: AbortSignal = live()) => searchAddresses(query, signal)

describe('the request', () => {
	it('asks the on-premises instance on this origin, not openstreetmap.org', async () => {
		const stub = installOsm({ results: [] })
		await search()

		expect(stub.calls[0]?.startsWith(NOMINATIM_SEARCH)).toBe(true)
		expect(stub.calls[0]).not.toContain('openstreetmap.org')
	})

	/*
	 * ⚠️ The reason this app has its own geocoder at all. `nominatim.openstreetmap.org` runs on donated
	 * hardware with a usage policy of one request per second and no bulk querying, and it enforces that
	 * with an IP block rather than a throttle — so a public site would take the whole platform's egress
	 * address down, not just its own address field.
	 */
	it('sends the parameters an Italian address form needs', async () => {
		const stub = installOsm({ results: [] })
		await search('via roma 1')

		const params = new URLSearchParams(stub.calls[0]?.split('?')[1] ?? '')

		expect(params.get('q')).toBe('via roma 1')
		expect(params.get('format')).toBe('jsonv2')
		expect(params.get('addressdetails')).toBe('1')
		expect(params.get('countrycodes')).toBe('it')
		expect(params.get('accept-language')).toBe('it')
		expect(params.get('limit')).toBe(String(MAX_RESULTS))
	})

	// `URLSearchParams` encodes, so a query with an ampersand cannot inject a parameter of its own — the
	// `limit` a caller appended by hand would otherwise be the caller's, not this module's.
	it('encodes a query that carries a reserved character', async () => {
		const stub = installOsm({ results: [] })
		await search('via a&b 1')

		const params = new URLSearchParams(stub.calls[0]?.split('?')[1] ?? '')

		expect(params.get('q')).toBe('via a&b 1')
		expect(params.get('limit')).toBe(String(MAX_RESULTS))
	})

	// Five fits under a text field without becoming a page of its own. Nominatim's own cap is 50.
	it('asks for a list short enough to render as a dropdown', () => {
		expect(MAX_RESULTS).toBe(5)
		expect(MAX_RESULTS).toBeLessThanOrEqual(50)
	})

	/*
	 * The signal is a required parameter rather than an option because a customer types faster than the
	 * network answers: without it, the request for `via r` can land after the request for `via roma` and
	 * overwrite the newer suggestions with older ones. This asserts it actually reaches `fetch`.
	 */
	it('rejects when the caller abandons the request', async () => {
		installOsm({ pending: true })
		const controller = new AbortController()

		const pending = search('via roma', controller.signal)
		controller.abort()

		await expect(pending).rejects.toThrow('The operation was aborted.')
	})
})

describe('the mapping', () => {
	it('flattens a result into the fields the address form carries', async () => {
		installOsm({ results: [resultOsm()] })

		expect(await search()).toEqual([
			{
				id: '240109189',
				label: 'Via Roma, 1, Milano, MI, 20121, Italia',
				street: 'Via Roma 1',
				postalCode: '20121',
				city: 'Milano',
				province: 'MI',
				lat: 45.4642,
				lon: 9.1895
			}
		])
	})

	/*
	 * jsonv2 puts `lat`/`lon` on the wire as strings and `place_id` as a number. Coercing rather than
	 * declaring the types is what keeps `lat` out of the map as the string `"45.46420"`, which MapLibre
	 * accepts and centres nowhere.
	 */
	it('coerces the wire types rather than trusting them', async () => {
		installOsm({ results: [resultOsm()] })
		const [found] = await search()

		expect(typeof found?.lat).toBe('number')
		expect(typeof found?.lon).toBe('number')
		expect(typeof found?.id).toBe('string')
	})

	/*
	 * ⚠️ The province comes from `ISO3166-2-lvl6`, never from `county`. Level 6 already *is* the code the
	 * form wants; `county` is the name as whichever mapper typed it — `Milano`, `Città Metropolitana di
	 * Milano`, `Provincia di Milano` — and there is no route from any of those to `MI`.
	 */
	it('reads the province from the ISO code and drops the country prefix', async () => {
		installOsm({
			results: [resultOsm({ address: { 'ISO3166-2-lvl6': 'IT-RM', county: 'Città Metropolitana di Roma Capitale' } })]
		})

		expect((await search())[0]?.province).toBe('RM')
	})

	it('leaves the province empty when OSM has no ISO code for the point', async () => {
		installOsm({ results: [resultOsm({ address: { road: 'Via Roma' } })] })

		expect((await search())[0]?.province).toBe('')
	})

	/*
	 * A city is tagged by size rather than by role, and exactly one of the three keys is present. Which
	 * one is an OSM classification decision the address form has no business knowing about.
	 */
	it.each([
		['city', 'Milano'],
		['town', 'Desio'],
		['village', 'Introbio']
	])('reads the locality from %s', async (key, name) => {
		installOsm({ results: [resultOsm({ address: { [key]: name } })] })

		expect((await search())[0]?.city).toBe(name)
	})

	it('prefers city over the smaller tags when more than one is present', async () => {
		installOsm({ results: [resultOsm({ address: { city: 'Milano', town: 'Desio', village: 'Introbio' } })] })

		expect((await search())[0]?.city).toBe('Milano')
	})

	it('leaves the city empty when the point carries none of the three', async () => {
		installOsm({ results: [resultOsm({ address: { road: 'Strada Provinciale 32' } })] })

		expect((await search())[0]?.city).toBe('')
	})

	// A trailing space in a street field is invisible on screen and reaches the database, where it breaks
	// the exact-match a later lookup does.
	it('joins street and house number without a trailing space when there is no number', async () => {
		installOsm({ results: [resultOsm({ address: { road: 'Strada Provinciale 32' } })] })

		expect((await search())[0]?.street).toBe('Strada Provinciale 32')
	})

	it('answers an empty street for a point with neither road nor number', async () => {
		installOsm({ results: [resultOsm({ address: { postcode: '20121' } })] })

		expect((await search())[0]?.street).toBe('')
	})

	/*
	 * `addressdetails=1` does not guarantee an `address` object — a point OSM knows only as a bounding box
	 * has none. Without the empty-address fallback every field below would read off `undefined` and throw
	 * inside the `.map`, turning a partial answer into a failed search.
	 */
	it('maps a result that carries no address at all', async () => {
		installOsm({ results: [resultOsm({ address: undefined })] })

		expect(await search()).toEqual([
			{
				id: '240109189',
				label: 'Via Roma, 1, Milano, MI, 20121, Italia',
				street: '',
				postalCode: '',
				city: '',
				province: '',
				lat: 45.4642,
				lon: 9.1895
			}
		])
	})

	// zod objects strip by default, and Nominatim sends a dozen keys this form has no use for —
	// `boundingbox`, `licence`, `osm_type`. None of them may reach the mutation input.
	it('drops the keys the form has no use for', async () => {
		installOsm({ results: [resultOsm({ licence: 'ODbL', osm_type: 'way', boundingbox: ['45', '46'] })] })
		const [found] = await search()

		expect(Object.keys(found ?? {}).sort()).toEqual(['city', 'id', 'label', 'lat', 'lon', 'postalCode', 'province', 'street'])
	})

	it('maps every result in the list, in the order they arrived', async () => {
		installOsm({
			results: [resultOsm({ place_id: 1, display_name: 'Prima' }), resultOsm({ place_id: 2, display_name: 'Seconda' })]
		})

		expect((await search()).map((found) => found.label)).toEqual(['Prima', 'Seconda'])
	})

	it('answers an empty list when the geocoder found nothing', async () => {
		installOsm({ results: [] })

		expect(await search('via che non esiste')).toEqual([])
	})
})

describe('the failures', () => {
	/*
	 * Throwing rather than answering an empty list. An empty list renders as "no such address", which
	 * tells a customer their street does not exist when the truth is that the geocoder is rate-limiting
	 * or down — and they retype a correct address until they give up.
	 */
	it.each([429, 500, 503])('throws on HTTP %i rather than reporting no matches', async (status) => {
		installOsm({ status, results: [] })

		await expect(search()).rejects.toThrow(`Geocoder answered ${String(status)}`)
	})

	it('throws when the body is not JSON at all', async () => {
		installOsm({ body: '<html>502 Bad Gateway</html>' })

		await expect(search()).rejects.toThrow()
	})

	// nginx answering the geocoder path with an object rather than the array Nominatim sends is a
	// misrouted proxy, and rendering nothing would make it look like a search that found nothing.
	it('throws when the answer is well-formed JSON of the wrong shape', async () => {
		installOsm({ body: JSON.stringify({ error: 'Unable to geocode' }) })

		await expect(search()).rejects.toThrow()
	})

	it('throws when a result is missing a field the form needs', async () => {
		installOsm({ results: [{ place_id: 1, lat: '45', lon: '9' }] })

		await expect(search()).rejects.toThrow()
	})
})
