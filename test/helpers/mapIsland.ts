/**
 * The `MapIsland` stub the page tests mount in place of the real island.
 *
 * ⚠️ MapLibre reaches for a WebGL context that jsdom does not have, so the real `MapIsland` would tear
 * the page down on the effect that builds the map — a failure of the environment, not of the page. What
 * a page test owes the map is *what it hands it*, which this renders as text. `MapIsland` and `ShopMap`
 * have their own tests, and those are where the map itself is asserted.
 *
 * Mount it as:
 *
 * ```ts
 * vi.mock('@/features/map/MapIsland', async () => (await import('../helpers/mapIsland')).mapIslandStub())
 * ```
 *
 * The dynamic import is not decoration. `vi.mock` is hoisted above every `import` in the file, so a
 * factory that closed over a top-level binding would read it while it is still in its temporal dead zone
 * whenever the mocked module is resolved first. Importing inside the factory defers that to the moment
 * the factory runs, which is always after this module has finished evaluating.
 */
export const mapIslandStub = async () => {
	const { createElement } = await import('react')

	return {
		MapIsland: (props: { center: readonly [number, number]; zoom: number; initialPins?: readonly { slug: string }[] }) =>
			createElement(
				'div',
				{ 'data-testid': 'map' },
				`${String(props.center[0])},${String(props.center[1])} @ ${String(props.zoom)} · ${(props.initialPins ?? []).map((pin) => pin.slug).join(' ')}`
			)
	}
}
