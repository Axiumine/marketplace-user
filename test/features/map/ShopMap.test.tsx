import { act, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ShopMapProps } from '@/features/map/ShopMap'

import type { GraphQLReplies, RestHandler } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { installOnlineListenerGuard } from '../../helpers/onlineListenerGuard'
import { renderWithClient } from '../../helpers/render'

installOnlineListenerGuard()

/**
 * MapLibre, replaced by something jsdom can run.
 *
 * ⚠️ There is no WebGL context in jsdom, so the real library throws at `new Map(...)` and nothing below
 * this line would ever execute. The fake is deliberately dumb — it records what it was told and hands back
 * what it was asked for — because everything worth testing here is the *wiring*: which layers exist, what
 * the viewport query asks for, when it is allowed to run, and what happens to an answer that arrives after
 * the visitor has navigated away.
 *
 * `vi.hoisted` is what makes the classes reachable from both the (hoisted) `vi.mock` factory and the tests
 * below. Every mock factory returns the *same* object, so the class identities survive the `vi.resetModules`
 * in `beforeEach` — which is there because `ShopMap` keeps `protocolRegistered` at module scope, and a
 * module-level flag that no test can reset is a mutant nothing kills.
 */
const maplibre = vi.hoisted(() => {
	type Handler = (event?: unknown) => void

	class FakeSource {
		data: unknown
		expansionZoom = 9
		readonly expansionCalls: number[] = []
		readonly expansionResolvers: (() => void)[] = []
		// Assigned in the body rather than declared as a parameter property: `erasableSyntaxOnly` is on, and
		// a parameter property is syntax that cannot be erased without emitting code.
		readonly spec: Record<string, unknown>

		constructor(spec: Record<string, unknown>) {
			this.spec = spec
			this.data = spec.data
		}

		setData(data: unknown): void {
			this.data = data
		}

		getClusterExpansionZoom(clusterId: number): Promise<number> {
			this.expansionCalls.push(clusterId)

			// Never settled by the library, always by the test: the "the map went away mid-flight" branch is
			// only reachable if the test can unmount between the click and the answer.
			return new Promise<number>((resolve) => {
				this.expansionResolvers.push(() => {
					resolve(this.expansionZoom)
				})
			})
		}
	}

	class FakeMap {
		readonly handlers = new Map<string, Handler[]>()
		readonly sources = new Map<string, FakeSource>()
		readonly layers: Record<string, unknown>[] = []
		readonly controls: { control: unknown; position: string | undefined }[] = []
		readonly eased: Record<string, unknown>[] = []
		readonly canvas = document.createElement('canvas')
		readonly bounds = { west: 9.1, south: 45.4, east: 9.3, north: 45.6 }
		readonly options: Record<string, unknown>
		removed = false

		constructor(options: Record<string, unknown>) {
			this.options = options
			state.maps.push(this)
		}

		/** MapLibre's `on` is `(type, handler)` or `(type, layerId, handler)`; both shapes are used here. */
		on(type: string, layerOrHandler: string | Handler, handler?: Handler): void {
			const key = typeof layerOrHandler === 'string' ? `${type}:${layerOrHandler}` : type
			const listener = typeof layerOrHandler === 'string' ? handler : layerOrHandler
			if (listener === undefined) return

			const listeners = this.handlers.get(key) ?? []
			listeners.push(listener)
			this.handlers.set(key, listeners)
		}

		fire(key: string, event?: unknown): void {
			for (const listener of this.handlers.get(key) ?? []) listener(event)
		}

		addControl(control: unknown, position?: string): void {
			this.controls.push({ control, position })
		}

		addSource(id: string, spec: Record<string, unknown>): void {
			this.sources.set(id, new FakeSource(spec))
		}

		getSource(id: string): FakeSource | undefined {
			return this.sources.get(id)
		}

		addLayer(spec: Record<string, unknown>): void {
			this.layers.push(spec)
		}

		getBounds() {
			const { west, south, east, north } = this.bounds

			return { getWest: () => west, getSouth: () => south, getEast: () => east, getNorth: () => north }
		}

		getCanvas(): HTMLCanvasElement {
			return this.canvas
		}

		easeTo(options: Record<string, unknown>): void {
			this.eased.push(options)
		}

		remove(): void {
			this.removed = true
		}
	}

	class FakePopup {
		lngLat: unknown
		content: HTMLElement | undefined
		map: unknown

		constructor() {
			state.popups.push(this)
		}

		setLngLat(lngLat: unknown): this {
			this.lngLat = lngLat
			return this
		}

		setDOMContent(content: HTMLElement): this {
			this.content = content
			return this
		}

		addTo(map: unknown): this {
			this.map = map
			return this
		}
	}

	class FakeNavigationControl {}

	class FakeProtocol {
		tile = (): undefined => undefined
	}

	const state = {
		maps: [] as FakeMap[],
		popups: [] as FakePopup[],
		addProtocol: vi.fn(),
		reset: () => {
			state.maps.length = 0
			state.popups.length = 0
			state.addProtocol.mockClear()
		}
	}

	return {
		state,
		module: {
			Map: FakeMap,
			NavigationControl: FakeNavigationControl,
			Popup: FakePopup,
			addProtocol: state.addProtocol
		},
		pmtiles: { Protocol: FakeProtocol }
	}
})

vi.mock('maplibre-gl', () => maplibre.module)
vi.mock('pmtiles', () => maplibre.pmtiles)

const CENTER: readonly [number, number] = [-71.06, 42.3601]

const SEED_PINS: NonNullable<ShopMapProps['initialPins']> = [
	{ _id: '66b0000000000000000000a1', publicName: 'Rivers Boutique', slug: 'rivers-boutique', coordinates: [-71.0589, 42.3601] }
]

const nodeOf = (n: number) => ({
	_id: `66b00000000000000000010${String(n)}`,
	publicName: `Shop ${String(n)}`,
	slug: `shop-${String(n)}`,
	position: { type: 'Point', coordinates: [9.18 + n / 100, 42.36] },
	distanceMeters: null
})

const nearby = (nodes: readonly unknown[], truncated = false): GraphQLReplies => ({
	CompaniesNearby: { data: { companiesNearby: { nodes, truncated } } }
})

const lastMap = () => {
	const map = maplibre.state.maps.at(-1)
	if (map === undefined) throw new Error('The map was never constructed')

	return map
}

const sourceOf = (map: ReturnType<typeof lastMap>) => {
	const source = map.getSource('shops')
	if (source === undefined) throw new Error('The «shops» source was never added')

	return source
}

const featuresOf = (
	data: unknown
): { id?: unknown; geometry: { coordinates: number[] }; properties: Record<string, unknown> }[] =>
	(data as { features: { id?: unknown; geometry: { coordinates: number[] }; properties: Record<string, unknown> }[] }).features

/** Every fire goes through `act`: a handler here ends in `setTruncated`, and a bare call warns. */
const fire = async (map: ReturnType<typeof lastMap>, key: string, event?: unknown): Promise<void> => {
	await act(async () => {
		map.fire(key, event)
	})
}

/** Real timers throughout — the debounce is 250 ms, and `userEvent` is not involved in this file. */
const pause = async (ms: number): Promise<void> => {
	await act(async () => {
		await new Promise<void>((resolve) => setTimeout(resolve, ms))
	})
}

const clusterEvent = (coordinates: readonly number[], clusterId = 7) => ({
	features: [{ geometry: { type: 'Point', coordinates: [...coordinates] }, properties: { cluster_id: clusterId } }]
})

const shopEvent = (coordinates: readonly number[], slug = 'rivers-boutique', publicName = 'Rivers Boutique') => ({
	features: [{ geometry: { type: 'Point', coordinates: [...coordinates] }, properties: { slug, publicName } }]
})

/**
 * A viewport query that answers only when the test says so, installed as a REST handler because the reply
 * queue in `stubGraphQL` settles immediately by design.
 */
const deferredNearby = () => {
	let release: (() => void) | undefined
	let sent = 0

	const rest: RestHandler = (_url, init) => {
		const body = JSON.parse(String(init?.body ?? '{}')) as { operationName?: string }
		if (body.operationName !== 'CompaniesNearby') return undefined

		sent += 1

		return new Promise<Response>((resolve) => {
			release = () => {
				resolve(
					new Response(JSON.stringify({ data: { companiesNearby: { nodes: [nodeOf(2)], truncated: true } } }), {
						status: 200,
						headers: { 'content-type': 'application/json' }
					})
				)
			}
		})
	}

	return {
		rest,
		sent: () => sent,
		release: () => {
			release?.()
		}
	}
}

let ShopMap: typeof import('@/features/map/ShopMap').ShopMap

interface MountOptions {
	initialPins?: NonNullable<ShopMapProps['initialPins']>
	replies?: GraphQLReplies
	rest?: RestHandler
	zoom?: number
}

const mount = ({ initialPins, replies = nearby([nodeOf(1)]), rest, zoom = 12 }: MountOptions = {}) => {
	const stub = stubGraphQL(replies, rest)

	const element =
		initialPins === undefined ? (
			<ShopMap center={CENTER} zoom={zoom} />
		) : (
			<ShopMap center={CENTER} zoom={zoom} initialPins={initialPins} />
		)

	const result = renderWithClient(element)

	return { ...result, stub, map: lastMap() }
}

beforeEach(async () => {
	maplibre.state.reset()

	// A fresh module per test, so `protocolRegistered` starts false in every one of them.
	vi.resetModules()
	;({ ShopMap } = await import('@/features/map/ShopMap'))
})

describe('ShopMap', () => {
	it('renders a box of the map’s height for MapLibre to mount into', () => {
		const { container } = mount()

		expect(container.querySelector('div.relative > div')).toHaveStyle({ height: 'var(--map-height)' })
	})

	/*
	 * ⚠️ One map per mount, no matter how many renders the box costs. The container arrives as state, so the
	 * first pass has nothing to mount into and the effect returns without building anything — a guard that
	 * ran the other way would leave a second WebGL context alive with no way to reach it, and MapLibre keeps
	 * a `resize` listener and a render loop per context.
	 */
	it('builds exactly one map, on the render that brings the box', () => {
		mount()

		expect(maplibre.state.maps).toHaveLength(1)
	})

	it('builds the map on that box, with the style and viewport it was given', () => {
		const { container, map } = mount({ zoom: 14 })

		expect(map.options.container).toBe(container.querySelector('div.relative > div'))
		expect(map.options.style).toBe('/map/style.json')
		expect(map.options.center).toEqual([-71.06, 42.3601])
		expect(map.options.zoom).toBe(14)
	})

	/*
	 * ⚠️ A copy, not the app's own tuple. MapLibre's `LngLatLike` is mutable and the library writes to what
	 * it is handed; passing the readonly value the route computed would have the map edit a constant that
	 * outlives it.
	 */
	it('hands MapLibre its own copy of the centre', () => {
		const { map } = mount()

		expect(map.options.center).not.toBe(CENTER)
	})

	// The basemap credit is a licence obligation for OSM-derived data, and `compact` is what keeps it from
	// covering a third of a phone screen.
	it('keeps the attribution control, compacted', () => {
		const { map } = mount()

		expect(map.options.attributionControl).toEqual({ compact: true })
	})

	it('puts the zoom control in the top-right corner', () => {
		const { map } = mount()

		expect(map.controls).toHaveLength(1)
		expect(map.controls[0]?.position).toBe('top-right')
	})

	/*
	 * ⚠️ Once per document, however many maps are mounted. `addProtocol` overwrites silently, and a map is
	 * built and torn down on every navigation to a page that has one — re-registering per mount would swap
	 * the handler out from under tile requests that are still in flight.
	 */
	it('registers the pmtiles protocol once, across every map it builds', () => {
		const first = mount()
		first.unmount()
		mount()

		expect(maplibre.state.addProtocol).toHaveBeenCalledTimes(1)
		expect(maplibre.state.addProtocol).toHaveBeenCalledWith('pmtiles', expect.any(Function))
	})

	it('matches the snapshot', async () => {
		const { container, map } = mount()
		await fire(map, 'load')

		expect(container.firstChild).toMatchSnapshot()
	})
})

describe('ShopMap and its layers', () => {
	/*
	 * ⚠️ Clustering belongs to the source. 500 pins drawn as DOM markers is 500 nodes over a canvas that
	 * repaints every frame of a drag; `cluster: true` keeps all of it inside WebGL, and it is the reason
	 * this is MapLibre rather than a marker library.
	 */
	it('clusters in the source rather than in the DOM', async () => {
		const { map } = mount()
		await fire(map, 'load')

		expect(sourceOf(map).spec).toMatchObject({ type: 'geojson', cluster: true, clusterRadius: 50, clusterMaxZoom: 14 })
	})

	it('seeds the source with the pins the listing already had', async () => {
		const { map } = mount({ initialPins: SEED_PINS })
		await fire(map, 'load')

		const [feature] = featuresOf(sourceOf(map).data)

		expect(feature?.id).toBe('66b0000000000000000000a1')
		expect(feature?.geometry.coordinates).toEqual([-71.0589, 42.3601])
		expect(feature?.properties).toEqual({ slug: 'rivers-boutique', publicName: 'Rivers Boutique' })
	})

	it('starts empty when the page had no pins to hand over', async () => {
		const { map } = mount()
		await fire(map, 'load')

		expect(featuresOf(sourceOf(map).data)).toHaveLength(0)
	})

	/*
	 * ⚠️ The three GeoJSON type discriminators, asserted by name. MapLibre reads them to decide what it has
	 * been handed, and it does so quietly: a collection whose `type` is wrong draws nothing at all and logs
	 * nothing either, so the map comes up empty and looks like a viewport with no shops in it. Nothing else
	 * in this suite reads them — every other assertion goes through `features`, which is present whatever the
	 * discriminators say.
	 */
	it('hands the source a GeoJSON FeatureCollection of Point features', async () => {
		const { map } = mount({ initialPins: SEED_PINS })
		await fire(map, 'load')

		const data = sourceOf(map).data as { type: string; features: { type: string; geometry: { type: string } }[] }

		expect(data.type).toBe('FeatureCollection')
		expect(data.features[0]?.type).toBe('Feature')
		expect(data.features[0]?.geometry.type).toBe('Point')
	})

	it('draws clusters, their counts and single shops as three layers', async () => {
		const { map } = mount()
		await fire(map, 'load')

		expect(map.layers.map((layer) => layer.id)).toEqual(['clusters', 'cluster-count', 'shop'])
	})

	// The two filters are complements: everything with a `point_count` is a cluster, everything without one
	// is a shop. Sharing a filter would draw one of them twice and the other never.
	it('splits the source between the cluster layers and the shop layer', async () => {
		const { map } = mount()
		await fire(map, 'load')

		expect(map.layers[0]?.filter).toEqual(['has', 'point_count'])
		expect(map.layers[1]?.filter).toEqual(['has', 'point_count'])
		expect(map.layers[2]?.filter).toEqual(['!', ['has', 'point_count']])
	})

	/*
	 * ⚠️ A symbol layer with no `glyphs` URL in the style document renders nothing and logs one warning, so
	 * the counts vanish while the circles stay. This test pins the layer that depends on it — see the note
	 * in the parent workspace's `marketplace-nginx/` about the style the basemap is served with.
	 */
	it('labels a cluster with the abbreviated count', async () => {
		const { map } = mount()
		await fire(map, 'load')

		expect(map.layers[1]).toMatchObject({ type: 'symbol', layout: { 'text-field': ['get', 'point_count_abbreviated'] } })
	})

	/*
	 * ⚠️ The paint blocks in full, `toEqual` rather than `toMatchObject`, because a missing paint property is
	 * exactly the failure that does not look like one. MapLibre falls back to its own defaults for anything
	 * it is not told — black circles at radius 5, no stroke — so a layer stripped of its paint still renders,
	 * still clusters, still responds to every click, and passes any assertion that checks the layer exists.
	 * The map simply stops being legible, in a way only a person looking at it would notice.
	 *
	 * The palette values are the app's own: `#ffd615` and `#0e0e13` are the brand yellow and near-black the
	 * clusters are drawn in, `#ba5c16` and `#fdffff` the shop pin and its halo against a pale basemap.
	 */
	it('paints clusters in brand yellow, stepped by how many shops they hold', async () => {
		const { map } = mount()
		await fire(map, 'load')

		expect(map.layers[0]?.type).toBe('circle')
		expect(map.layers[0]?.paint).toEqual({
			'circle-color': '#ffd615',
			'circle-stroke-color': '#0e0e13',
			'circle-stroke-width': 1,
			// Three sizes: under ten shops, ten to fifty, and above. A single radius makes a cluster of 400
			// look like a cluster of 4.
			'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 30]
		})
	})

	it('writes the cluster count in the same near-black as the stroke', async () => {
		const { map } = mount()
		await fire(map, 'load')

		expect(map.layers[1]?.paint).toEqual({ 'text-color': '#0e0e13' })
	})

	// A single shop is a different colour from a cluster on purpose — the two are read at a glance, and a
	// pin that looks like a cluster is a pin nobody clicks.
	it('paints a single shop in its own colour, haloed so it stays visible over the basemap', async () => {
		const { map } = mount()
		await fire(map, 'load')

		expect(map.layers[2]?.type).toBe('circle')
		expect(map.layers[2]?.paint).toEqual({
			'circle-color': '#ba5c16',
			'circle-stroke-color': '#fdffff',
			'circle-stroke-width': 2,
			'circle-radius': 7
		})
	})
})

describe('ShopMap and the viewport query', () => {
	it('asks for the shops inside the bounds once the map has settled', async () => {
		const { map, stub } = mount()
		await fire(map, 'load')

		await waitFor(() => {
			expect(stub.calls).toHaveLength(1)
		})

		expect(stub.calls[0]?.operationName).toBe('CompaniesNearby')
		expect(stub.calls[0]?.variables).toEqual({
			bbox: { minLng: 9.1, minLat: 45.4, maxLng: 9.3, maxLat: 45.6 },
			limit: 500
		})
	})

	/*
	 * ⚠️ The debounce, and the reason it is not optional. A drag fires `moveend` once, but a pinch-zoom
	 * fires it repeatedly, and each one is a geo query against a collection sized for hundreds of thousands
	 * of shops. Four moves inside a quarter second must cost one query, not four.
	 */
	it('coalesces a burst of moves into a single query', async () => {
		const { map, stub } = mount()

		await fire(map, 'load')
		await fire(map, 'moveend')
		await fire(map, 'moveend')
		await fire(map, 'moveend')
		await pause(600)

		expect(stub.calls).toHaveLength(1)
	})

	/*
	 * ⚠️ The bounds move before the second query, and they have to. urql's document cache answers an
	 * identical query from memory without touching `fetch`, so a test that panned to nowhere would count one
	 * call and read as a broken debounce — while a real pan always changes the bbox.
	 */
	it('queries again when the visitor moves the map somewhere else', async () => {
		const { map, stub } = mount()

		await fire(map, 'load')
		await pause(400)

		map.bounds.west = 11.2
		map.bounds.east = 11.4
		await fire(map, 'moveend')
		await pause(400)

		expect(stub.calls).toHaveLength(2)
		expect(stub.calls[1]?.variables).toEqual({
			bbox: { minLng: 11.2, minLat: 45.4, maxLng: 11.4, maxLat: 45.6 },
			limit: 500
		})
	})

	it('replaces the pins with what the viewport answered', async () => {
		const { map } = mount({ initialPins: SEED_PINS, replies: nearby([nodeOf(1), nodeOf(2)]) })
		await fire(map, 'load')

		await waitFor(() => {
			expect(featuresOf(sourceOf(map).data)).toHaveLength(2)
		})

		expect(featuresOf(sourceOf(map).data)[0]?.properties).toEqual({ slug: 'shop-1', publicName: 'Shop 1' })
	})

	it('empties the map when the viewport holds no shops', async () => {
		const { map } = mount({ initialPins: SEED_PINS, replies: nearby([]) })
		await fire(map, 'load')

		await waitFor(() => {
			expect(featuresOf(sourceOf(map).data)).toHaveLength(0)
		})
	})

	// The resolver caps the answer at 500 and says so rather than paginating a map. A visitor looking at a
	// city centre needs to know the pins are a subset, or the empty streets read as empty streets.
	it('says so when the resolver truncated the answer', async () => {
		const { map } = mount({ replies: nearby([nodeOf(1)], true) })
		await fire(map, 'load')

		expect(await screen.findByText(/Showing the first 500 shops in view/)).toBeInTheDocument()
	})

	it('matches the snapshot when the answer was truncated', async () => {
		const { container, map } = mount({ replies: nearby([nodeOf(1)], true) })
		await fire(map, 'load')

		await screen.findByText(/Showing the first 500 shops in view/)

		expect(container.firstChild).toMatchSnapshot()
	})

	// Before anything has been asked, nothing has been truncated. A notice that shows on the first paint and
	// disappears a moment later is a flash of wrong information on every map the app draws.
	it('says nothing before the first viewport query has answered', () => {
		mount()

		expect(screen.queryByText(/Showing the first 500 shops in view/)).not.toBeInTheDocument()
	})

	it('says nothing when the whole viewport fits', async () => {
		const { map } = mount({ replies: nearby([nodeOf(1)]) })
		await fire(map, 'load')
		await pause(400)

		expect(screen.queryByText(/Showing the first 500 shops in view/)).not.toBeInTheDocument()
	})

	/*
	 * A resolver answering `data: null` with no `errors` — valid on the wire, if not on this schema's own
	 * `companiesNearby: [Item!]!` contract — is the one case the render's `loadError ? … : truncated && …`
	 * does not shadow: `result.error` stays `undefined` (nothing to build a `CombinedError` from), so the
	 * truncated branch actually renders, and `result.data?.companiesNearby.truncated` short-circuits to
	 * `undefined` on the null before the nullish default decides what `truncated` becomes. The safe default
	 * is "nothing was truncated" — claiming the 500-pin cap was hit on an answer that named zero shops
	 * would be its own false statement, layered on top of the empty map.
	 */
	it('says nothing was truncated on a null answer with no error', async () => {
		const { map } = mount({ replies: { CompaniesNearby: {} } })
		await fire(map, 'load')
		await pause(400)

		expect(screen.queryByText(/Showing the first 500 shops in view/)).not.toBeInTheDocument()
	})

	/*
	 * ⚠️ A refused query is an empty viewport, not a crash and not the previous viewport left on screen.
	 * `result.data` is `undefined` on a GraphQL error, and reading `.companiesNearby` off it would throw
	 * inside a promise nobody awaits — an unhandled rejection with a stack pointing at urql.
	 *
	 * Keeping the stale pins was the alternative and it is worse: they belong to a bounding box the visitor
	 * has already left, so every one of them would be drawn in the wrong place.
	 */
	it('empties the map when the viewport query is refused', async () => {
		const { map } = mount({
			initialPins: SEED_PINS,
			replies: { CompaniesNearby: { errors: [graphQLError('Nope')], status: 400 } }
		})
		await fire(map, 'load')

		await waitFor(() => {
			expect(featuresOf(sourceOf(map).data)).toHaveLength(0)
		})
		expect(screen.queryByText(/Showing the first 500 shops in view/)).not.toBeInTheDocument()
	})

	/*
	 * ⚠️ `companiesNearby` is non-null, so a resolver error nulls the whole envelope — read with no check on
	 * `result.error`, that collapses to the same empty pin list as "no shops here", with nothing on screen
	 * to tell the two apart. The home page's own default centre and zoom routinely exceed the backend's
	 * bbox cap, so this is reachable on an ordinary first load, not only during an outage.
	 */
	it('shows an error banner when the viewport query is refused, instead of going quiet', async () => {
		const { map } = mount({
			initialPins: SEED_PINS,
			replies: { CompaniesNearby: { errors: [graphQLError('Nope')], status: 400 } }
		})
		await fire(map, 'load')

		expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load shops nearby')
	})

	it('says nothing has failed before the first viewport query has answered', () => {
		mount()

		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	it('says nothing has failed once a viewport query succeeds', async () => {
		const { map } = mount({ replies: nearby([nodeOf(1)]) })
		await fire(map, 'load')
		await pause(400)

		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	// The banner is per query, not permanent: a visitor who pans away from the refused bbox into one the
	// backend answers should see the map recover, not carry a stale failure notice over a working map.
	it('clears the error banner once a later query succeeds', async () => {
		const { map } = mount({
			initialPins: SEED_PINS,
			replies: {
				CompaniesNearby: [{ errors: [graphQLError('Nope')], status: 400 }, nearby([nodeOf(1)]).CompaniesNearby as never]
			}
		})
		await fire(map, 'load')
		await screen.findByRole('alert')

		map.bounds.west = 11.2
		map.bounds.east = 11.4
		await fire(map, 'moveend')
		await pause(400)

		await waitFor(() => {
			expect(screen.queryByRole('alert')).not.toBeInTheDocument()
		})
	})

	// An answer that arrives before `load` added the source has nowhere to go. Returning is the whole
	// handling: `setData` on `undefined` throws inside a promise nobody awaits.
	it('survives an answer that arrives before the source exists', async () => {
		const rejections: unknown[] = []
		const onRejection = (reason: unknown) => rejections.push(reason)
		process.on('unhandledRejection', onRejection)

		try {
			const { map } = mount({ replies: nearby([nodeOf(1)], true) })
			await fire(map, 'moveend')

			expect(await screen.findByText(/Showing the first 500 shops in view/)).toBeInTheDocument()
			expect(map.sources.size).toBe(0)

			// The guard above is the whole handling — nothing awaits `load()`, so a version of it that reaches
			// `setData` on the missing source would only ever surface as a rejection nobody catches.
			await pause(50)
			expect(rejections).toEqual([])
		} finally {
			process.off('unhandledRejection', onRejection)
		}
	})

	/*
	 * ⚠️ Navigating away while a query is in flight is the ordinary case, not an edge case. Touching a
	 * removed map throws, and the throw lands in an unhandled rejection with no stack anyone can act on —
	 * `disposed` is what stops the answer from being applied at all.
	 */
	it('drops an answer that arrives after the visitor has left', async () => {
		const gate = deferredNearby()
		const { map, unmount } = mount({ initialPins: SEED_PINS, rest: gate.rest })

		await fire(map, 'load')
		await waitFor(() => {
			expect(gate.sent()).toBe(1)
		})

		unmount()
		gate.release()
		await pause(50)

		// ⚠️ The seeded pin is asserted by `id`, not by count. The deferred reply carries exactly one shop of
		// its own, so a `disposed` check that let the answer through would replace one feature with one other
		// feature and leave every length assertion true.
		expect(featuresOf(sourceOf(map).data)).toHaveLength(1)
		expect(featuresOf(sourceOf(map).data)[0]?.id).toBe('66b0000000000000000000a1')
	})

	it('never sends the query at all when the map is torn down first', async () => {
		const { map, stub, unmount } = mount()

		await fire(map, 'load')
		unmount()
		await pause(600)

		expect(stub.calls).toHaveLength(0)
	})

	it('tears the map down on unmount', () => {
		const { map, unmount } = mount()

		unmount()

		expect(map.removed).toBe(true)
	})
})

describe('ShopMap and a click on a cluster', () => {
	// A cluster is a zoom affordance, not a destination: clicking it zooms to the level where it breaks
	// apart, which is what stops a dense city from being one permanent blob.
	it('zooms to where the cluster comes apart', async () => {
		const { map } = mount()
		await fire(map, 'load')
		await fire(map, 'click:clusters', clusterEvent([9.2, 45.5]))

		const source = sourceOf(map)

		expect(source.expansionCalls).toEqual([7])

		await act(async () => {
			source.expansionResolvers[0]?.()
		})

		await waitFor(() => {
			expect(map.eased).toEqual([{ center: [9.2, 45.5], zoom: 9 }])
		})
	})

	it('ignores a click that carries no feature', async () => {
		const { map } = mount()
		await fire(map, 'load')
		await fire(map, 'click:clusters', {})

		expect(sourceOf(map).expansionCalls).toEqual([])
	})

	/*
	 * ⚠️ A position that is not a pair of finite numbers is dropped rather than cast. MapLibre reads the
	 * missing element as `undefined` and centres the viewport on `NaN`: a blank canvas, no error anywhere.
	 */
	it('does not chase a cluster whose position is not a pair of numbers', async () => {
		const { map } = mount()
		await fire(map, 'load')
		await fire(map, 'click:clusters', clusterEvent([9.2]))

		expect(sourceOf(map).expansionCalls).toEqual([])
		expect(map.eased).toEqual([])
	})

	it('does not move a map that has already gone away', async () => {
		const { map, unmount } = mount()
		await fire(map, 'load')
		await fire(map, 'click:clusters', clusterEvent([9.2, 45.5]))

		const source = sourceOf(map)
		unmount()

		await act(async () => {
			source.expansionResolvers[0]?.()
		})
		await pause(50)

		expect(map.eased).toEqual([])
	})
})

describe('ShopMap and a click on a shop', () => {
	/*
	 * ⚠️ A popup with a real `<a href>`, not a navigation on click. A pin is a few pixels wide and a mis-tap
	 * on a phone is common, so a click confirms rather than commits — and the anchor is the only thing that
	 * makes a pin reachable without a pointer at all.
	 */
	it('opens a popup carrying a real link to the shop', async () => {
		const { map } = mount()
		await fire(map, 'load')
		await fire(map, 'click:shop', shopEvent([-71.0589, 42.3601]))

		const popup = maplibre.state.popups[0]

		expect(popup?.content?.tagName).toBe('A')
		expect(popup?.content).toHaveAttribute('href', '/shop/rivers-boutique')
		expect(popup?.content?.textContent).toBe('Rivers Boutique')
	})

	/*
	 * The popup is built with `createElement`, outside React, so it inherits none of the app's link styling —
	 * an unclassed anchor in there is black body text on a white bubble with nothing to say it is clickable.
	 * The one visual affordance the pin has is this class.
	 */
	it('styles the popup link so it reads as a link', async () => {
		const { map } = mount()
		await fire(map, 'load')
		await fire(map, 'click:shop', shopEvent([-71.0589, 42.3601]))

		expect(maplibre.state.popups[0]?.content).toHaveAttribute('class', 'font-semibold underline')
	})

	it('anchors the popup to the pin, on the map it was clicked on', async () => {
		const { map } = mount()
		await fire(map, 'load')
		await fire(map, 'click:shop', shopEvent([-71.0589, 42.3601]))

		expect(maplibre.state.popups[0]?.lngLat).toEqual([-71.0589, 42.3601])
		expect(maplibre.state.popups[0]?.map).toBe(map)
	})

	// The slug reaches the DOM as an attribute value, so it is encoded rather than interpolated raw — a
	// name is owner-supplied text and the URL is built from it.
	it('encodes the slug into the address', async () => {
		const { map } = mount()
		await fire(map, 'load')
		await fire(map, 'click:shop', shopEvent([-71.0589, 42.3601], 'boutique rivers & co'))

		expect(maplibre.state.popups[0]?.content).toHaveAttribute('href', '/shop/boutique%20rivers%20%26%20co')
	})

	it('opens nothing when the click carries no feature', async () => {
		const { map } = mount()
		await fire(map, 'load')
		await fire(map, 'click:shop', {})

		expect(maplibre.state.popups).toHaveLength(0)
	})

	it('opens nothing for a pin whose position is not a pair of numbers', async () => {
		const { map } = mount()
		await fire(map, 'load')
		await fire(map, 'click:shop', shopEvent([-71.0589]))

		expect(maplibre.state.popups).toHaveLength(0)
	})
})

describe('ShopMap and the pointer', () => {
	it.each(['clusters', 'shop'])('turns the cursor into a pointer over the %s layer', async (layer) => {
		const { map } = mount()
		await fire(map, 'load')
		await fire(map, `mouseenter:${layer}`)

		expect(map.canvas.style.cursor).toBe('pointer')
	})

	it.each(['clusters', 'shop'])('puts the cursor back on the way out of the %s layer', async (layer) => {
		const { map } = mount()
		await fire(map, 'load')
		await fire(map, `mouseenter:${layer}`)
		await fire(map, `mouseleave:${layer}`)

		expect(map.canvas.style.cursor).toBe('')
	})
})
