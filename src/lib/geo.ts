import { isFiniteNumber } from '@/lib/number'

/**
 * GeoJSON positions, narrowed to the pair MapLibre wants.
 *
 * ⚠️ **This is a runtime check, and it replaces a cast that does not compile and should not have.**
 * `Point.coordinates` is typed `Position` — `number[]`, no length in the type — and
 * `coordinates as readonly [number, number]` is refused outright with
 * `TS2352: Conversion of type 'number[]' to type 'readonly [number, number]' may be a mistake because
 * neither type sufficiently overlaps with the other`: an unlengthed array is not assignable to a
 * two-element tuple, and a mutable array is not assignable to a readonly one, so neither direction holds.
 *
 * Widening the target to a mutable `[number, number]` makes the same cast compile — that is why the two
 * casts inside `ShopMap` went unreported for as long as they did — and it buys nothing. The value can
 * still be a one-element array at runtime, in which case MapLibre reads element `1` as `undefined` and
 * centres the viewport on latitude `NaN`: a blank canvas with no error anywhere.
 *
 * Answering `undefined` for anything that is not a pair of finite numbers hands the decision back to the
 * caller, which always has a good one — a shop whose position is broken renders with no map rather than
 * with a map of the wrong place.
 */
export const toLngLat = (coordinates: readonly number[] | null | undefined): readonly [number, number] | undefined => {
	if (coordinates === null || coordinates === undefined) return undefined

	const [lng, lat] = coordinates

	// One check, not two. This used to be a `typeof lng !== 'number'` pair followed by a
	// `Number.isFinite` pair, and the first pair was unreachable in the only sense that matters:
	// `Number.isFinite` does not coerce, so every value the `typeof` test rejected was rejected a line
	// later anyway. It existed to narrow `number | undefined` for the compiler, which `isFiniteNumber`
	// now does — see src/lib/number.ts. A branch no input can distinguish is a branch no test can cover
	// and no mutant can be killed on.
	if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) return undefined

	return [lng, lat]
}

/**
 * The same pair, mutable.
 *
 * MapLibre's `LngLatLike` is a mutable `[number, number]`, so every call into the library needs a copy
 * rather than the readonly value the app passes around. Spreading a tuple preserves its length in the
 * type, so this stays a two-element tuple and not a `number[]`.
 */
export const toMutableLngLat = (coordinates: readonly [number, number]): [number, number] => [...coordinates]
