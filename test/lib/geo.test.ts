import { describe, expect, it } from 'vitest'

import { toLngLat, toMutableLngLat } from '@/lib/geo'

/*
 * The module replaces a cast that does not compile. `Point.coordinates` is `number[]` with no length in
 * the type, and the runtime value really can be short or hold a `NaN` a resolver computed — MapLibre
 * then centres the viewport on latitude `undefined` and draws a blank canvas with no error anywhere.
 * Every case below is one shape that produces that blank canvas.
 */
describe('toLngLat', () => {
	// GeoJSON order, and it is the whole reason this is not `[lat, lng]`: the pair is longitude first,
	// which is the opposite of how every address is spoken.
	it('keeps GeoJSON order — longitude first', () => {
		expect(toLngLat([-71.0636, 42.3626])).toEqual([-71.0636, 42.3626])
	})

	it('accepts a zero coordinate, which is a real place off the coast of Ghana', () => {
		expect(toLngLat([0, 0])).toEqual([0, 0])
	})

	it('drops anything after the pair', () => {
		expect(toLngLat([-71.0636, 42.3626, 120])).toEqual([-71.0636, 42.3626])
	})

	it.each([
		['null', null],
		['undefined', undefined],
		['an empty array', []],
		['a single number', [-71.0636]]
	])('answers undefined for %s, so the caller can render no map at all', (_label, coordinates) => {
		expect(toLngLat(coordinates)).toBeUndefined()
	})

	/*
	 * JSON carries no `NaN`, so this cannot arrive over the wire — but a resolver computing a centroid
	 * can produce one, and `NaN` is a `number` that passes every type check and plots nowhere.
	 * `Number.isFinite` is typed `(value: unknown) => boolean` rather than as a guard, so it narrows
	 * nothing and has to run after the `typeof` pair rather than instead of it.
	 */
	it.each([
		['NaN longitude', [Number.NaN, 42.3626]],
		['NaN latitude', [-71.0636, Number.NaN]],
		['Infinite longitude', [Number.POSITIVE_INFINITY, 42.3626]],
		['Infinite latitude', [-71.0636, Number.NEGATIVE_INFINITY]]
	])('answers undefined for %s', (_label, coordinates) => {
		expect(toLngLat(coordinates)).toBeUndefined()
	})
})

describe('toMutableLngLat', () => {
	// MapLibre's `LngLatLike` is a mutable `[number, number]`, so every call into the library needs a
	// copy. Spreading a tuple keeps its length in the type; `Array.from` would widen it to `number[]`
	// and stop compiling at the call site.
	it('copies the pair rather than handing the library the array the app holds', () => {
		const source: readonly [number, number] = [-71.0636, 42.3626]
		const copy = toMutableLngLat(source)

		expect(copy).toEqual([-71.0636, 42.3626])
		expect(copy).not.toBe(source)
	})

	it('leaves the source untouched when the copy is written to', () => {
		const source: readonly [number, number] = [-71.0636, 42.3626]
		const copy = toMutableLngLat(source)
		copy[0] = 0

		expect(source[0]).toBe(-71.0636)
	})
})
