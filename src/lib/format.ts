/**
 * Display formatting.
 *
 * `en-GB` throughout, and it is a market choice rather than a leftover: `31/12/2026` and `1.2 km` are
 * what a customer on this platform expects to read. It is the one locale the app names, and every
 * formatter here goes through it rather than through the browser's.
 *
 * `Intl` reads the ambient time zone, so every test run pins `TZ=UTC` (in the scripts *and* in
 * vitest.config.ts — Stryker's worker pool ignores the config one). Without it the same assertion
 * passes in one zone and fails in CI, one hour out, which reads as a formatter bug.
 */

import { isFiniteNumber } from '@/lib/number'

const LOCALE = 'en-GB'

/**
 * ⚠️ **No options, deliberately** — `{ day: '2-digit', month: '2-digit', year: 'numeric' }` used to be
 * spelled out here and was removed because it is a no-op, not because the shape it asked for is wrong.
 * With no date-time component at all the spec fills in numeric year, month and day, and `en-GB` renders
 * numeric month and day padded: `resolvedOptions()` comes back byte-identical either way, and formatting
 * every 37th day from year 1 to 2300 produced zero differing strings. Two spellings of one formatter is
 * a token nothing can observe, so it is the shorter one that stays.
 *
 * What holds the output in place is the assertions, not the options — `test/lib/format.test.ts` pins
 * `02/01/2026` and `01/02/2026` as literals, so a CLDR update that moved the locale off `dd/MM/y` breaks the
 * build rather than the account page.
 */
const DATE = new Intl.DateTimeFormat(LOCALE)

/**
 * ⚠️ **`new Date(null)` is 1970-01-01, not Invalid Date.** It is the one absent value the `Date`
 * constructor coerces into a real instant, so a missing `birth.date` would render as `01/01/1970` — a
 * date a customer could reasonably believe was theirs. `undefined` and `''` are both Invalid Date
 * already, so mapping every absent shape to `NaN` here is what lets the two formatters below carry a
 * single guard instead of one branch per shape, two of which no input could ever distinguish.
 */
const absentAsInvalidDate = (iso: string | null | undefined): string | number => iso ?? Number.NaN

/**
 * An ISO-8601 string from the API, as `DD/MM/YYYY`.
 *
 * An unparseable value comes back as an em dash rather than as `Invalid Date`. The API answers
 * `DateTime` for `registeredAt` and `birth.date`, so this should not happen — but a date is rendered
 * inside an account page, and the failure mode of letting it through is a screen that looks broken
 * because one field is.
 */
export const formatDate = (iso: string | null | undefined): string => {
	const date = new Date(absentAsInvalidDate(iso))
	return Number.isNaN(date.getTime()) ? '—' : DATE.format(date)
}

/** `YYYY-MM-DD`, which is what an `<input type="date">` reads and writes. Not localised on purpose. */
export const toDateInputValue = (iso: string | null | undefined): string => {
	const date = new Date(absentAsInvalidDate(iso))
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
	// `isFiniteNumber` alone, not preceded by a null/undefined pair: `Number.isFinite` does not coerce,
	// so both of those fail it already and the pair was a branch no input could distinguish.
	if (!isFiniteNumber(metres)) return null

	return metres < 1000 ? `${METRES.format(metres)} m` : `${KILOMETRES.format(metres / 1000)} km`
}

/** `1,234` — thousands separated, for result counts. */
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
