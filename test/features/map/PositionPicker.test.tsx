import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PositionPickerProps } from '@/features/map/PositionPicker'

/**
 * MapLibre, replaced by something jsdom can run.
 *
 * ⚠️ There is no WebGL context in jsdom, so the real library throws at `new Map(...)` and nothing below
 * that line would ever execute. The fake records what it was told and hands back what it was asked for,
 * because everything worth testing here is the *wiring*: where the map opens, where the pin goes, which
 * way round the coordinates leave, and when the viewport is allowed to move.
 *
 * `vi.hoisted` is what makes the classes reachable from both the hoisted `vi.mock` factories and the tests
 * below, with one object shared by every factory so the class identities survive the `vi.resetModules` in
 * `beforeEach` — which is there because the pmtiles protocol is registered behind a module-scope flag, and
 * a flag no test can reset is a mutant nothing kills.
 */
const maplibre = vi.hoisted(() => {
	type Handler = (event?: unknown) => void

	class FakeMarker {
		lngLat: [number, number] = [0, 0]
		readonly handlers = new Map<string, Handler[]>()
		readonly options: Record<string, unknown>
		addedTo: unknown
		removed = false

		constructor(options: Record<string, unknown>) {
			this.options = options
			state.markers.push(this)
		}

		on(type: string, handler: Handler): this {
			const listeners = this.handlers.get(type) ?? []
			listeners.push(handler)
			this.handlers.set(type, listeners)

			return this
		}

		setLngLat(lngLat: [number, number]): this {
			this.lngLat = lngLat

			return this
		}

		addTo(map: unknown): this {
			this.addedTo = map

			return this
		}

		remove(): this {
			this.removed = true

			return this
		}

		getLngLat(): { lng: number; lat: number } {
			return { lng: this.lngLat[0], lat: this.lngLat[1] }
		}

		/** A finished drag: the library has already moved the pin by the time `dragend` fires. */
		dragTo(lng: number, lat: number): void {
			this.lngLat = [lng, lat]
			for (const listener of this.handlers.get('dragend') ?? []) listener()
		}
	}

	class FakeMap {
		readonly handlers = new Map<string, Handler[]>()
		readonly controls: { control: unknown; position: string | undefined }[] = []
		readonly eased: Record<string, unknown>[] = []
		readonly options: Record<string, unknown>
		removed = false

		constructor(options: Record<string, unknown>) {
			this.options = options
			state.maps.push(this)
		}

		on(type: string, handler: Handler): void {
			const listeners = this.handlers.get(type) ?? []
			listeners.push(handler)
			this.handlers.set(type, listeners)
		}

		fire(type: string, event?: unknown): void {
			for (const listener of this.handlers.get(type) ?? []) listener(event)
		}

		addControl(control: unknown, position?: string): void {
			this.controls.push({ control, position })
		}

		easeTo(options: Record<string, unknown>): void {
			this.eased.push(options)
		}

		remove(): void {
			this.removed = true
		}
	}

	class FakeNavigationControl {}

	class FakeProtocol {
		tile = (): undefined => undefined
	}

	const state = {
		maps: [] as FakeMap[],
		markers: [] as FakeMarker[],
		addProtocol: vi.fn(),
		reset: () => {
			state.maps.length = 0
			state.markers.length = 0
			state.addProtocol.mockClear()
		}
	}

	return {
		state,
		module: {
			Map: FakeMap,
			Marker: FakeMarker,
			NavigationControl: FakeNavigationControl,
			addProtocol: state.addProtocol
		},
		pmtiles: { Protocol: FakeProtocol }
	}
})

vi.mock('maplibre-gl', () => maplibre.module)
vi.mock('pmtiles', () => maplibre.pmtiles)

/** Boston: 71.06 W, 42.36 N. ⚠️ Longitude first — the pair is wrong in the only way that matters if reordered. */
const AT: readonly [number, number] = [-71.0589, 42.3601]

/** Somewhere else entirely, for the second point in a test that needs the map to have moved. */
const ELSEWHERE: readonly [number, number] = [-71.09, 42.34]

const lastMap = () => {
	const map = maplibre.state.maps.at(-1)
	if (map === undefined) throw new Error('The map was never constructed')

	return map
}

const lastMarker = () => {
	const marker = maplibre.state.markers.at(-1)
	if (marker === undefined) throw new Error('No pin was ever dropped')

	return marker
}

let PositionPicker: typeof import('@/features/map/PositionPicker').PositionPicker

/*
 * ⚠️ A fresh module graph per test. `registerPmtilesProtocol` is guarded by a flag at module scope, so
 * without this every assertion about it would depend on which test ran first.
 */
beforeEach(async () => {
	maplibre.state.reset()
	vi.resetModules()
	;({ PositionPicker } = await import('@/features/map/PositionPicker'))
})

interface MountOptions {
	readonly position?: PositionPickerProps['position']
	readonly onPick?: PositionPickerProps['onPick']
}

/*
 * Props written out rather than spread: `exactOptionalPropertyTypes` is on, and a spread of a partial is
 * a value the compiler cannot prove carries `onPick` at all.
 */
const mount = (options: MountOptions = {}) => {
	const onPick = vi.fn()
	const rendered = render(<PositionPicker position={options.position} onPick={onPick} />)

	const rerender = (next: MountOptions = {}) => {
		rendered.rerender(<PositionPicker position={next.position} onPick={next.onPick ?? onPick} />)
	}

	return { ...rendered, onPick, rerender }
}

describe('PositionPicker mounting', () => {
	it('builds exactly one map, on the box it rendered', () => {
		const { container } = mount()

		expect(maplibre.state.maps).toHaveLength(1)
		expect(lastMap().options.container).toBe(container.firstChild)
	})

	it('serves the basemap from this app rather than from a tile service', () => {
		mount()

		expect(lastMap().options.style).toBe('/map/style.json')
	})

	/*
	 * ⚠️ Once per document, however many maps are mounted. `addProtocol` overwrites silently, and this app
	 * now has two map components that both need the handler — a flag per component would re-register on
	 * every mount while in-flight tile requests still held the old one.
	 */
	it('registers the pmtiles protocol once, for however many maps there are', () => {
		mount()
		mount({ position: AT })

		expect(maplibre.state.addProtocol).toHaveBeenCalledTimes(1)
		expect(maplibre.state.addProtocol).toHaveBeenCalledWith('pmtiles', expect.any(Function))
	})

	it('carries the basemap credit, which is a licence obligation', () => {
		mount()

		expect(lastMap().options.attributionControl).toEqual({ compact: true })
	})

	it('gives the customer a way to zoom without a scroll wheel', () => {
		mount()

		expect(lastMap().controls).toHaveLength(1)
		expect(lastMap().controls[0]?.position).toBe('top-right')
	})

	/*
	 * A map with nothing to show opens on the whole country and asks. Opening at street zoom on an arbitrary
	 * place would ask "is this it?", which is a question with a wrong answer already in it.
	 */
	it('opens on the country when the address has no position', () => {
		mount()

		expect(lastMap().options.center).toEqual([-98.5795, 39.8283])
		expect(lastMap().options.zoom).toBe(3)
	})

	it('opens on the address, close enough to see a street, when it has one', () => {
		mount({ position: AT })

		expect(lastMap().options.center).toEqual([-71.0589, 42.3601])
		expect(lastMap().options.zoom).toBe(16)
	})

	// MapLibre wants a mutable pair and mutates the one it is given while the viewport moves. Handing it the
	// prop itself would have the map rewrite a value the form still believes it owns.
	it('hands the library a copy of the pair, not the prop', () => {
		mount({ position: AT })

		expect(lastMap().options.center).not.toBe(AT)
	})

	it('takes the map down with the form', () => {
		const { unmount } = mount({ position: AT })
		const map = lastMap()

		unmount()

		expect(map.removed).toBe(true)
	})
})

describe('PositionPicker pin', () => {
	it('drops no pin on an address that has no position', () => {
		mount()

		expect(maplibre.state.markers).toHaveLength(0)
	})

	it('drops a draggable pin on the position it was given', () => {
		mount({ position: AT })

		expect(maplibre.state.markers).toHaveLength(1)
		expect(lastMarker().options.draggable).toBe(true)
		// The catalogue's own pin colour: a shop pin and an address pin are the same object to a customer.
		expect(lastMarker().options.color).toBe('#ba5c16')
		expect(lastMarker().lngLat).toEqual([-71.0589, 42.3601])
		expect(lastMarker().addedTo).toBe(lastMap())
	})

	it('moves the pin it already has rather than dropping a second one', () => {
		const { rerender } = mount({ position: AT })

		rerender({ position: ELSEWHERE })

		expect(maplibre.state.markers).toHaveLength(1)
		expect(lastMarker().lngLat).toEqual([-71.09, 42.34])
	})

	// The form re-renders on every keystroke in the fields above the map, and each one hands over a freshly
	// built pair. A pin that moved on identity rather than on value would be rewritten on every letter typed.
	it('leaves the pin alone when the form re-renders around it', () => {
		const { rerender } = mount({ position: AT })
		const eased = lastMap().eased.length

		rerender({ position: [...AT] })

		expect(maplibre.state.markers).toHaveLength(1)
		expect(lastMap().eased).toHaveLength(eased)
	})

	it('takes the pin away when the position is removed', () => {
		const { rerender } = mount({ position: AT })
		const marker = lastMarker()

		rerender()

		expect(marker.removed).toBe(true)
	})

	it('drops a fresh pin when a position comes back after being removed', () => {
		const { rerender } = mount({ position: AT })

		rerender()
		rerender({ position: ELSEWHERE })

		expect(maplibre.state.markers).toHaveLength(2)
		expect(lastMarker().lngLat).toEqual([-71.09, 42.34])
		expect(lastMarker().removed).toBe(false)
	})

	it('does nothing at all for an address that never had a position', () => {
		mount()

		expect(maplibre.state.markers).toHaveLength(0)
		expect(lastMap().eased).toHaveLength(0)
	})
})

describe('PositionPicker picking', () => {
	/*
	 * ⚠️ MapLibre reads a point out as named `lng`/`lat` fields; what leaves this component is a GeoJSON
	 * pair, longitude first. Swapping them does not throw — it stores a point in the Southern Ocean — so
	 * this assertion is the one that pins the order.
	 */
	it('hands back the point that was clicked, longitude first', () => {
		const { onPick } = mount()

		lastMap().fire('click', { lngLat: { lng: -71.09, lat: 42.34 } })

		expect(onPick).toHaveBeenCalledWith([-71.09, 42.34])
	})

	it('hands back where the pin was let go, longitude first', () => {
		const { onPick } = mount({ position: AT })

		lastMarker().dragTo(-71.09, 42.34)

		expect(onPick).toHaveBeenCalledWith([-71.09, 42.34])
	})

	/*
	 * The handlers are wired once, when the map is built, and the form passes a new arrow on every render —
	 * so a closure over the first one would send every later drop to a function the form has forgotten.
	 */
	it('calls the handler the form has now, not the one the map was built with', () => {
		const { rerender } = mount({ position: AT })
		const later = vi.fn()

		rerender({ position: AT, onPick: later })
		lastMap().fire('click', { lngLat: { lng: -71.09, lat: 42.34 } })

		expect(later).toHaveBeenCalledWith([-71.09, 42.34])
	})
})

describe('PositionPicker framing', () => {
	/*
	 * A position from the geocoder is a place the customer has not looked at yet — nothing else would bring
	 * it into view, so the map goes there and zooms in far enough to check it.
	 */
	it('frames a position that arrived from outside the map', () => {
		const { rerender } = mount()

		rerender({ position: AT })

		expect(lastMap().eased).toEqual([{ center: [-71.0589, 42.3601], zoom: 16 }])
	})

	/*
	 * ⚠️ And never on a point the map itself produced. Every drop is written to form state and handed
	 * straight back as a prop; framing on that would re-centre the viewport the instant the customer let go
	 * of the pin, so the map would walk across the screen through every small correction.
	 */
	it('stays where it is when the pin was dropped on it', () => {
		const { rerender, onPick } = mount()

		lastMap().fire('click', { lngLat: { lng: -71.09, lat: 42.34 } })
		rerender({ position: [-71.09, 42.34] })

		expect(onPick).toHaveBeenCalledTimes(1)
		expect(lastMap().eased).toHaveLength(0)
	})

	it('stays where it is when the pin was dragged across it', () => {
		const { rerender } = mount({ position: AT })
		const framed = lastMap().eased.length

		lastMarker().dragTo(-71.09, 42.34)
		rerender({ position: [-71.09, 42.34] })

		expect(lastMap().eased).toHaveLength(framed)
	})

	// The exemption is for one point, not for the rest of the session: the next suggestion picked in the
	// field above the map has to be framed like any other.
	it('frames the next position that comes from outside, after a drop', () => {
		const { rerender } = mount()

		lastMap().fire('click', { lngLat: { lng: -71.09, lat: 42.34 } })
		rerender({ position: [-71.09, 42.34] })
		rerender({ position: AT })

		expect(lastMap().eased).toEqual([{ center: [-71.0589, 42.3601], zoom: 16 }])
	})
})

describe('PositionPicker markup', () => {
	// The height is reserved in CSS, not by the map: the box is empty until the chunk lands, and an island
	// mounting into a zero-height box shoves the rest of the form down the page.
	it('holds its height open from the first paint', () => {
		const { container } = mount()

		expect(container.firstChild).toHaveStyle({ height: 'var(--map-pick-height)' })
	})

	it('matches the snapshot', () => {
		const { container } = mount({ position: AT })

		expect(container.firstChild).toMatchSnapshot()
	})
})
