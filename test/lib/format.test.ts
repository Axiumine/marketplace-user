import { beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * ⚠️ **Nothing here imports `@/lib/format` statically, and that is the whole design of this file.**
 *
 * The module builds three `Intl` formatters at module scope, so every token in them — the locale and
 * every option — is load-time code. Two separate things go wrong with a static import, and both of them
 * are silent:
 *
 *   1. A static import evaluates the module before a test runs, so a mutation testing run that activates
 *      a mutant *after* load never sees the mutated value. The assertions below can be as precise as
 *      they like and still read the un-mutated formatter.
 *   2. Worse, an unusable locale makes the module *throw at import*. Vitest then reports the file as
 *      failed with **no tests run at all** — and a run with zero failed tests is exactly what Stryker
 *      reads as a surviving mutant. The suite looks red to a human and green to the gate.
 *
 * `vi.resetModules()` plus an `await import()` in `beforeEach` moves the evaluation inside the test,
 * where a throw is a failing test and a mutated option is an assertable string. Measured: with the
 * static import, all five module-scope mutants survived at 82.14%.
 *
 * Do not "simplify" this back into a top-level import, and do not silence what it catches with
 * `ignoreStatic` in stryker.config.mjs.
 *
 * The specifier is a **literal**: `import(someVariable)` is not statically analysable, so Vite cannot
 * rewrite it into its own module-runner call and the module lands outside the registry `resetModules`
 * clears — which produces the first failure above with none of the noise of the second.
 *
 * Every assertion is a literal string rather than a comparison against another `Intl` call. The point of
 * the module is the locale it picks, and
 * `expect(formatDate(x)).toBe(new Intl.DateTimeFormat('it-IT', …).format(x))` passes for `en-US` too — it
 * compares the formatter against itself.
 */

let format: typeof import('@/lib/format')

beforeEach(async () => {
	vi.resetModules()
	format = await import('@/lib/format')
})

describe('the module-scope Intl formatters', () => {
	// The one assertion that is about loading rather than about output: an unusable locale throws inside
	// `new Intl.DateTimeFormat`, and every date on the site goes with it.
	it('builds every formatter without throwing, which an unusable locale would not', async () => {
		vi.resetModules()

		await expect(import('@/lib/format')).resolves.toBeDefined()
	})
})

describe('formatDate', () => {
	it('writes an ISO timestamp the Italian way, day first', () => {
		expect(format.formatDate('2026-08-05T10:30:00.000Z')).toBe('05/08/2026')
	})

	// Two digits, both of them, on a date that has neither. The bare `it-IT` default writes `1/2/2026`, so
	// this is the one input that tells the configured formatter apart from an unconfigured one.
	it('keeps the two-digit day and month of a single-digit date', () => {
		expect(format.formatDate('2026-01-02T00:00:00.000Z')).toBe('02/01/2026')
		expect(format.formatDate('2026-02-01T00:00:00.000Z')).toBe('01/02/2026')
	})

	it('writes the year in full, not as two digits', () => {
		expect(format.formatDate('2026-12-25T00:00:00.000Z')).toBe('25/12/2026')
	})

	// The zone is pinned to UTC by vitest.config.ts *and* by the test scripts. Without it this is
	// 31/12/2025 in London and 01/01/2026 in Rome, and the failure reads as a formatter bug.
	it('reads the timestamp in UTC, not in the machine zone', () => {
		expect(format.formatDate('2025-12-31T23:30:00.000Z')).toBe('31/12/2025')
	})

	it.each([
		['null', null],
		['undefined', undefined],
		['an empty string', '']
	])('answers an em dash for %s', (_label, value) => {
		expect(format.formatDate(value)).toBe('—')
	})

	// The API types this field `DateTime`, so it should not happen — but the value is rendered inside an
	// account page, and letting `Invalid Date` through makes the whole screen look broken.
	it('answers an em dash rather than Invalid Date for a value that is not one', () => {
		expect(format.formatDate('not a date')).toBe('—')
	})
})

describe('toDateInputValue', () => {
	// Deliberately not localised: `<input type="date">` reads and writes `YYYY-MM-DD` whatever the page
	// language is, and handing it `05/08/2026` clears the box.
	it('answers the ISO date an <input type="date"> reads', () => {
		expect(format.toDateInputValue('2026-08-05T10:30:00.000Z')).toBe('2026-08-05')
	})

	it.each([
		['null', null],
		['undefined', undefined],
		['an empty string', ''],
		['a value that is not a date', 'not a date']
	])('answers an empty string for %s', (_label, value) => {
		expect(format.toDateInputValue(value)).toBe('')
	})
})

describe('formatDistance', () => {
	it('writes metres below a kilometre, with no decimals', () => {
		expect(format.formatDistance(940)).toBe('940 m')
	})

	it('rounds metres rather than truncating them', () => {
		expect(format.formatDistance(940.6)).toBe('941 m')
		expect(format.formatDistance(999.6)).toBe('1000 m')
	})

	// The switch is at a thousand exactly, and the kilometre side always carries one decimal — `1 km`
	// and `1,0 km` differ, and a listing where some rows have a decimal and some do not reads as broken.
	it('switches to kilometres at exactly 1000 metres', () => {
		expect(format.formatDistance(999)).toBe('999 m')
		expect(format.formatDistance(1000)).toBe('1,0 km')
	})

	it('writes kilometres with a comma, the Italian decimal separator', () => {
		expect(format.formatDistance(1234)).toBe('1,2 km')
	})

	/*
	 * One decimal, always — and the group separator on the thousands. `it-IT` declares
	 * `minimumGroupingDigits: 2`, so grouping only shows from five digits up; `2040,0 km` is correct and
	 * would pass a laxer assertion whichever options the formatter had.
	 */
	it('groups thousands of kilometres with a dot, one decimal either way', () => {
		expect(format.formatDistance(2000)).toBe('2,0 km')
		expect(format.formatDistance(12_345_678)).toBe('12.345,7 km')
	})

	/*
	 * Null is not an error and must not render as `0 m`: the bbox form of `companiesNearby` computes no
	 * distance at all — `$geoWithin` does not — and only the radius form does. "0 m" claims the shop is
	 * where the customer is standing.
	 */
	it.each([
		['null', null],
		['undefined', undefined],
		['NaN', Number.NaN],
		['Infinity', Number.POSITIVE_INFINITY]
	])('answers null for %s, so the caller can render nothing', (_label, value) => {
		expect(format.formatDistance(value)).toBeNull()
	})
})

describe('formatCount', () => {
	it('groups thousands with a dot', () => {
		expect(format.formatCount(12_345)).toBe('12.345')
	})

	/*
	 * ⚠️ Not a bug and not a rounding accident: `it-IT` declares `minimumGroupingDigits: 2`, so a
	 * four-digit number is written unseparated and grouping starts at five. Asserted rather than avoided,
	 * because "1.234" is what everyone writing this test by hand expects and the first reaction to `1234`
	 * on screen is to add `useGrouping: 'always'` — which would be wrong for the locale.
	 */
	it('leaves a four-digit count unseparated, as Italian typography wants', () => {
		expect(format.formatCount(1234)).toBe('1234')
	})

	it('leaves a count below a thousand alone', () => {
		expect(format.formatCount(42)).toBe('42')
	})
})

describe('formatTotal', () => {
	it('writes the number when the resolver counted them all', () => {
		expect(format.formatTotal(12_345, true)).toBe('12.345')
	})

	/*
	 * The plus is the whole point. `totalIsExact: false` means the resolver stopped at its counting cap,
	 * so the number is the cap and not the answer — and it always understates. A customer told "500 shops"
	 * when there are 40 000 concludes the site is empty.
	 */
	it('marks a capped count with a plus', () => {
		expect(format.formatTotal(500, false)).toBe('500+')
	})
})
