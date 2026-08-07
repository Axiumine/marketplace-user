import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ShopMapProps } from '@/features/map/ShopMap'

/*
 * ⚠️ The real `ShopMap` is mocked away here, and that is the whole point of the file. `MapIsland` exists to
 * keep MapLibre out of a bundle and out of a server render, so a test of it must never load MapLibre —
 * loading it would prove the opposite of what is being asserted, and jsdom has no WebGL context to give it
 * anyway. What is under test is the island machinery: the dynamic import, the client-only gate, and the
 * placeholder that holds the space open. `ShopMap`'s own behaviour is tested in ShopMap.test.tsx.
 *
 * The factory is `async` and reaches for `createElement` through a dynamic import because `vi.mock` is
 * hoisted above every static import in this file — JSX in there compiles to a call on a jsx-runtime binding
 * that does not exist yet at the moment the factory runs.
 */
vi.mock('@/features/map/ShopMap', async () => {
	const { createElement } = await import('react')

	return {
		default: (props: ShopMapProps) =>
			createElement(
				'div',
				{ 'data-testid': 'shop-map' },
				`${String(props.center[0])},${String(props.center[1])} @ ${String(props.zoom)} · ${String(props.initialPins?.length ?? 0)} pins`
			)
	}
})

const CENTER = [9.19, 45.4642] as const

const PINS: NonNullable<ShopMapProps['initialPins']> = [
	{ _id: '66b0000000000000000000a1', publicName: 'Bottega Rossi', slug: 'bottega-rossi', coordinates: [9.1895, 45.4642] }
]

const placeholderOf = (container: HTMLElement): HTMLElement => {
	const placeholder = container.querySelector('[aria-hidden="true"]')
	if (placeholder === null) throw new Error('No placeholder rendered')

	return placeholder as HTMLElement
}

/**
 * Lets the lazy chunk land, inside `act`.
 *
 * A test that only asserts on the placeholder never awaits anything, and React then reports the resolved
 * import as an update outside `act` — a warning on a test that passed, which is the kind of noise that
 * teaches people to ignore warnings.
 */
const flush = async (): Promise<void> => {
	await act(async () => {})
}

let MapIsland: typeof import('@/features/map/MapIsland').MapIsland

/*
 * ⚠️ A fresh module per test, and this one is not optional. `lazy()` caches its resolved component on the
 * object it returns, so the second render in a file would find the chunk already there and never show the
 * fallback — every placeholder assertion after the first would pass or fail on test order rather than on
 * the component.
 */
beforeEach(async () => {
	vi.resetModules()
	;({ MapIsland } = await import('@/features/map/MapIsland'))
})

describe('MapIsland', () => {
	/*
	 * ⚠️ The one assertion this component exists for. A fallback of `null` collapses to zero height, and the
	 * map shoving everything below it down the page at hydration is exactly what Cumulative Layout Shift
	 * measures — a metric that is scored on the page as a whole, so one island costs the whole route.
	 */
	it('holds the map’s final height open before the map is there', async () => {
		const { container } = render(<MapIsland center={CENTER} zoom={12} />)

		expect(placeholderOf(container)).toHaveStyle({ height: 'var(--map-height)' })

		await flush()
	})

	it('renders the placeholder as a full-width box rather than as nothing', async () => {
		const { container } = render(<MapIsland center={CENTER} zoom={12} />)

		expect(placeholderOf(container)).toHaveClass('w-full')

		await flush()
	})

	// The placeholder is furniture: it says nothing, does nothing and is not the map. Announcing it would
	// have a screen reader stop at a decorative box on every catalogue page.
	it('hides the placeholder from assistive technology', async () => {
		const { container } = render(<MapIsland center={CENTER} zoom={12} />)

		expect(placeholderOf(container)).toBeEmptyDOMElement()
		expect(screen.queryByRole('img')).not.toBeInTheDocument()

		await flush()
	})

	it('swaps the map in once its chunk has arrived', async () => {
		render(<MapIsland center={CENTER} zoom={12} />)

		expect(await screen.findByTestId('shop-map')).toBeInTheDocument()
	})

	it('takes the placeholder away once the map is mounted', async () => {
		const { container } = render(<MapIsland center={CENTER} zoom={12} />)

		await screen.findByTestId('shop-map')

		expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
	})

	// The island is a pass-through: every prop reaches the map unchanged, including the pins the listing
	// beside it already loaded.
	it('hands the map the props it was given', async () => {
		render(<MapIsland center={CENTER} zoom={14} initialPins={PINS} />)

		expect(await screen.findByTestId('shop-map')).toHaveTextContent('9.19,45.4642 @ 14 · 1 pins')
	})

	it('defaults to no pins when the page has none to hand over', async () => {
		render(<MapIsland center={CENTER} zoom={12} />)

		expect(await screen.findByTestId('shop-map')).toHaveTextContent('· 0 pins')
	})
})
