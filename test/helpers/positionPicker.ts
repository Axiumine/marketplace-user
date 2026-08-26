/**
 * The `PositionPickerIsland` stub every form test mounts in place of the real map.
 *
 * ⚠️ MapLibre reaches for a WebGL context jsdom does not have, so the real island tears the form down on
 * the effect that builds the map — a failure of the environment, not of the form. What a form test owes
 * the map is the pair it hands over and what it does with a pin the customer drops, and both are here as
 * plain DOM. `PositionPicker` and `PositionPickerIsland` have tests of their own; that is where the map is.
 *
 * Mount it as:
 *
 * ```ts
 * vi.mock('@/features/map/PositionPickerIsland', async () => (await import('../../helpers/positionPicker')).positionPickerStub())
 * ```
 *
 * The dynamic import is not decoration. `vi.mock` is hoisted above every `import` in the file, so a factory
 * closing over a top-level binding would read it while it is still in its temporal dead zone whenever the
 * mocked module is resolved first.
 */

/**
 * The point the stub's button drops.
 *
 * ⚠️ Deliberately more precise than any address is: a real pin answers a full double, and the form rounds
 * it. A fixture already rounded to six decimals would leave that rounding untested.
 */
export const PIN_DROPPED: readonly [number, number] = [-71.05893123, 42.36015678]

/** What the form should store for `PIN_DROPPED`, rounded and with the trailing zeros gone. */
export const PIN_DROPPED_TEXT = '-71.058931,42.360157'

export const positionPickerStub = async () => {
	const { createElement } = await import('react')

	return {
		PositionPickerIsland: (props: {
			position?: readonly [number, number] | undefined
			onPick: (position: readonly [number, number]) => void
		}) =>
			createElement('div', { 'data-testid': 'position-picker' }, [
				createElement(
					'span',
					{ key: 'at', 'data-testid': 'picker-position' },
					props.position === undefined ? 'nowhere' : `${String(props.position[0])},${String(props.position[1])}`
				),
				createElement(
					'button',
					{
						key: 'drop',
						type: 'button',
						onClick: () => {
							props.onPick(PIN_DROPPED)
						}
					},
					'Drop the pin'
				)
			])
	}
}
