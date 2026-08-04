/**
 * Display formatting.
 *
 * `it-IT` throughout, and it is a market choice rather than a leftover: this platform serves Italy, so
 * `31/12/2026` and `1,2 km` are what a customer expects to read. It is the one place Italian survives
 * in this codebase deliberately — everything that is a *name* is English.
 *
 * `Intl` reads the ambient time zone, so every test run pins `TZ=UTC` (in the scripts *and* in
 * vitest.config.ts — Stryker's worker pool ignores the config one). Without it the same assertion
 * passes in Rome and fails in CI, one hour out, which reads as a formatter bug.
 */

const LOCALE = 'it-IT'

const DATE = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' })

/**
 * An ISO-8601 string from the API, as `DD/MM/YYYY`.
 *
 * An unparseable value comes back as an em dash rather than as `Invalid Date`. The API answers
 * `DateTime` for `registeredAt` and `birth.date`, so this should not happen — but a date is rendered
 * inside an account page, and the failure mode of letting it through is a screen that looks broken
 * because one field is.
 */
export const formatDate = (iso: string | null | undefined): string => {
	if (iso === null || iso === undefined || iso === '') return '—'

	const date = new Date(iso)
	return Number.isNaN(date.getTime()) ? '—' : DATE.format(date)
}

/** `YYYY-MM-DD`, which is what an `<input type="date">` reads and writes. Not localised on purpose. */
export const toDateInputValue = (iso: string | null | undefined): string => {
	if (iso === null || iso === undefined || iso === '') return ''

	const date = new Date(iso)
	return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

const METRES = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })
const KILOMETRES = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/**
 * `distanceMeters` from `companiesNearby`, as a readable distance.
 *
 * Null below a kilometre is not an error: the bbox form of the query computes no distance at all
 * (`$geoWithin` does not), only the radius form does. A caller that renders "0 m" for a missing
 * distance is claiming the shop is where the customer is standing.
 */
export const formatDistance = (metres: number | null | undefined): string | null => {
	if (metres === null || metres === undefined || !Number.isFinite(metres)) return null

	return metres < 1000 ? `${METRES.format(metres)} m` : `${KILOMETRES.format(metres / 1000)} km`
}

/** `1.234` — thousands separated, for result counts. */
export const formatCount = (value: number): string => METRES.format(value)

/**
 * The count line under a listing.
 *
 * `totalIsExact` is false when the resolver hit its counting cap, and then `total` is the cap rather
 * than the answer. Rendering it as a number would be a lie in the one direction that matters: it always
 * understates, so a customer told "500 shops" when there are 40 000 concludes the site is empty.
 */
export const formatTotal = (total: number, totalIsExact: boolean): string =>
	totalIsExact ? formatCount(total) : `${formatCount(total)}+`
