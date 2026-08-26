import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PositionPickerProps } from '@/features/map/PositionPicker'

/*
 * ⚠️ The real `PositionPicker` is mocked away, and that is the whole point of the file. The island exists
 * to keep MapLibre out of a bundle and out of a server render, so a test of it must never load MapLibre —
 * loading it would prove the opposite of what is asserted, and jsdom has no WebGL context to give it. What
 * is under test is the island machinery: the dynamic import, the client-only gate, the placeholder that
 * holds the space open, and that every prop reaches the map unchanged.
 *
 * The factory is `async` and reaches for `createElement` through a dynamic import because `vi.mock` is
 * hoisted above every static import here — JSX in there compiles to a call on a jsx-runtime binding that
 * does not exist yet at the moment the factory runs.
 */
vi.mock('@/features/map/PositionPicker', async () => {
	const { createElement } = await import('react')

	return {
		default: (props: PositionPickerProps) =>
			createElement(
				'button',
				{
					'data-testid': 'position-picker',
					type: 'button',
					onClick: () => {
						props.onPick([-71.09, 42.34])
					}
				},
				props.position === undefined ? 'nowhere' : `${String(props.position[0])},${String(props.position[1])}`
			)
	}
})

const AT: readonly [number, number] = [-71.0589, 42.3601]

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

let PositionPickerIsland: typeof import('@/features/map/PositionPickerIsland').PositionPickerIsland

/*
 * ⚠️ A fresh module per test, and not optional: `lazy()` caches its resolved component on the object it
 * returns, so the second render in a file would find the chunk already there and never show the fallback.
 * Every placeholder assertion after the first would then pass or fail on test order.
 */
beforeEach(async () => {
	vi.resetModules()
	;({ PositionPickerIsland } = await import('@/features/map/PositionPickerIsland'))
})

describe('PositionPickerIsland', () => {
	/*
	 * ⚠️ The assertion this component exists for. A fallback of `null` collapses to zero height, and the map
	 * shoving the fields and the save button down the page at hydration is exactly what Cumulative Layout
	 * Shift measures.
	 */
	it('holds the map’s final height open before the map is there', async () => {
		const { container } = render(<PositionPickerIsland onPick={vi.fn()} />)

		expect(placeholderOf(container)).toHaveStyle({ height: 'var(--map-pick-height)' })

		await flush()
	})

	it('renders the placeholder as a full-width box rather than as nothing', async () => {
		const { container } = render(<PositionPickerIsland onPick={vi.fn()} />)

		expect(placeholderOf(container)).toHaveClass('w-full')

		await flush()
	})

	// The placeholder is furniture: it says nothing, does nothing and is not the map. Announcing it would
	// have a screen reader stop at a decorative box in the middle of a form.
	it('hides the placeholder from assistive technology', async () => {
		const { container } = render(<PositionPickerIsland onPick={vi.fn()} />)

		expect(placeholderOf(container)).toBeEmptyDOMElement()

		await flush()
	})

	it('swaps the map in once its chunk has arrived', async () => {
		render(<PositionPickerIsland onPick={vi.fn()} />)

		expect(await screen.findByTestId('position-picker')).toBeInTheDocument()
	})

	it('takes the placeholder away once the map is mounted', async () => {
		const { container } = render(<PositionPickerIsland onPick={vi.fn()} />)

		await screen.findByTestId('position-picker')

		expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
	})

	it('hands the map the position it was given', async () => {
		render(<PositionPickerIsland position={AT} onPick={vi.fn()} />)

		expect(await screen.findByTestId('position-picker')).toHaveTextContent('-71.0589,42.3601')
	})

	it('hands the map nothing when the address has no position', async () => {
		render(<PositionPickerIsland onPick={vi.fn()} />)

		expect(await screen.findByTestId('position-picker')).toHaveTextContent('nowhere')
	})

	// The island is a pass-through in both directions: the point the map produces has to reach the form, or
	// nothing a customer does on the map is ever saved.
	it('hands what the map picked back to the form', async () => {
		const onPick = vi.fn()
		render(<PositionPickerIsland onPick={onPick} />)

		await userEvent.click(await screen.findByTestId('position-picker'))

		expect(onPick).toHaveBeenCalledWith([-71.09, 42.34])
	})

	it('matches the snapshot before the map has arrived', async () => {
		const { container } = render(<PositionPickerIsland position={AT} onPick={vi.fn()} />)

		expect(container.firstChild).toMatchSnapshot()

		await flush()
	})

	it('matches the snapshot once the map has swapped in', async () => {
		const { container } = render(<PositionPickerIsland position={AT} onPick={vi.fn()} />)

		await screen.findByTestId('position-picker')

		expect(container.firstChild).toMatchSnapshot()
	})
})
