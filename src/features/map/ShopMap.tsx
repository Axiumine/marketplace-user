import 'maplibre-gl/dist/maplibre-gl.css'

import type { FeatureCollection, Point } from 'geojson'
import * as maplibregl from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { useClient } from 'urql'

import { CompaniesNearbyDocument } from '@/api/operations/publicResource/queries'
import { env } from '@/env'
import { toLngLat, toMutableLngLat } from '@/lib/geo'

import { registerPmtilesProtocol } from './pmtiles'

/**
 * The map, and the only module in the app that pulls MapLibre into a bundle.
 *
 * ⚠️ Never import this file statically from a route. It is loaded through `MapIsland`'s dynamic import,
 * which is what keeps ~800 KB of mapping library out of the initial payload of every catalogue page —
 * including the pages that never show a map. The CSS import above rides along with it for the same
 * reason.
 *
 * It is also client-only by construction: MapLibre reaches for `window` and a WebGL context at module
 * scope, so a server render of this file throws rather than degrading.
 *
 * ⚠️ Two import shapes here are not the ones every MapLibre example uses, and both are forced.
 * `maplibre-gl` 6 ships **no default export** — `import maplibregl from 'maplibre-gl'` fails with
 * `TS1192: Module … has no default export`, so it is a namespace import. And the GeoJSON types are
 * imported from `geojson` rather than written against the ambient `GeoJSON.*` namespace: `tsconfig.json`
 * pins `types` to three entries, which switches off the automatic inclusion of `@types/*` that would
 * otherwise put that global namespace in scope.
 */

/** Matches the resolver's own cap. Asking for more is answered with `truncated: true`, not with more pins. */
const MAX_PINS = 500

/**
 * Moves are coalesced for a quarter second before a query goes out.
 *
 * A drag fires `moveend` once, but a pinch-zoom on a phone fires it repeatedly, and each one is a geo
 * query against a collection sized for hundreds of thousands of shops. 250 ms is below the threshold
 * where a person perceives the map as lagging and well above the interval a gesture produces.
 */
const SETTLE_MS = 250

interface Pin {
	readonly _id: string
	readonly publicName: string
	readonly slug: string
	readonly coordinates: readonly number[]
}

const SOURCE = 'shops'

export interface ShopMapProps {
	/** `[lng, lat]`, GeoJSON order — the same order the API speaks, so nothing is swapped on the way in. */
	readonly center: readonly [number, number]
	readonly zoom: number
	/** Pins to show before the first viewport query answers. The listing already has them; reuse beats refetch. */
	readonly initialPins?: readonly Pin[]
}

const toFeatureCollection = (pins: readonly Pin[]): FeatureCollection => ({
	type: 'FeatureCollection',
	features: pins.map((pin) => ({
		type: 'Feature',
		id: pin._id,
		geometry: { type: 'Point', coordinates: [...pin.coordinates] },
		properties: { slug: pin.slug, publicName: pin.publicName }
	}))
})

export const ShopMap = ({ center, zoom, initialPins = [] }: ShopMapProps) => {
	/*
	 * The box MapLibre mounts into, held in state rather than in a ref.
	 *
	 * A ref would be read once, on the effect run that follows the first commit, and nothing would re-run
	 * the effect if the element arrived later. State makes the arrival a render: the first pass has no box
	 * and builds no map, the second has one and builds it. Exactly one map either way.
	 */
	const [container, setContainer] = useState<HTMLDivElement | null>(null)
	const mapRef = useRef<maplibregl.Map | null>(null)
	const client = useClient()
	const [truncated, setTruncated] = useState(false)

	useEffect(() => {
		if (container === null) return

		registerPmtilesProtocol()

		const map = new maplibregl.Map({
			container,
			style: env.mapStyleUrl,
			center: toMutableLngLat(center),
			zoom,
			// The basemap credit is a licence obligation for OSM-derived data. It is also in the footer, so
			// the obligation is met even if the canvas never paints — this control is the in-map copy.
			attributionControl: { compact: true }
		})

		mapRef.current = map
		map.addControl(new maplibregl.NavigationControl(), 'top-right')

		let timer: ReturnType<typeof setTimeout> | undefined
		let disposed = false

		const load = async () => {
			const bounds = map.getBounds()

			const result = await client
				.query(CompaniesNearbyDocument, {
					bbox: {
						minLng: bounds.getWest(),
						minLat: bounds.getSouth(),
						maxLng: bounds.getEast(),
						maxLat: bounds.getNorth()
					},
					limit: MAX_PINS
				})
				.toPromise()

			// The component can unmount while a query is in flight — a navigation away from the page is the
			// normal case. Touching a removed map throws, and the throw lands in an unhandled rejection.
			if (disposed) return

			const nodes = result.data?.companiesNearby.nodes ?? []
			setTruncated(result.data?.companiesNearby.truncated ?? false)

			const source = map.getSource(SOURCE)
			if (source === undefined) return

			// `setData` answers a promise — it hands the data to the worker that re-tiles it and resolves when
			// that is done. Awaited so a failure there rejects this `load()` rather than floating away as an
			// unhandled rejection with no line of ours in its stack.
			await (source as maplibregl.GeoJSONSource).setData(
				toFeatureCollection(
					nodes.map((node) => ({
						_id: node._id,
						publicName: node.publicName,
						slug: node.slug,
						coordinates: node.position.coordinates
					}))
				)
			)
		}

		// `clearTimeout` is spelled without a guard on purpose, here and in the teardown below. It accepts
		// `undefined` and does nothing with it, so `if (timer !== undefined)` is a branch whose two sides are
		// indistinguishable from outside — untestable by construction, and the kind of check that reads as if
		// it were protecting against something.
		const scheduleLoad = () => {
			clearTimeout(timer)
			timer = setTimeout(() => void load(), SETTLE_MS)
		}

		map.on('load', () => {
			/*
			 * ⚠️ Clustering is done by the source, not by the application. At 500 pins in view, drawing one
			 * marker element each would put 500 DOM nodes over a canvas that repaints on every frame of a
			 * drag; `cluster: true` keeps the whole thing inside WebGL and is the reason this is MapLibre and
			 * not Leaflet with markers.
			 */
			map.addSource(SOURCE, {
				type: 'geojson',
				data: toFeatureCollection(initialPins),
				cluster: true,
				clusterRadius: 50,
				clusterMaxZoom: 14
			})

			map.addLayer({
				id: 'clusters',
				type: 'circle',
				source: SOURCE,
				filter: ['has', 'point_count'],
				paint: {
					'circle-color': '#ffd615',
					'circle-stroke-color': '#0e0e13',
					'circle-stroke-width': 1,
					'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 30]
				}
			})

			/*
			 * ⚠️ This layer needs a `glyphs` URL in the style document — a symbol layer with no font source
			 * renders nothing and logs one warning, so the count silently disappears while the circles stay.
			 * The parent workspace's `marketplace-nginx/` serves the Protomaps style, which carries one; a hand-written
			 * style must too.
			 */
			map.addLayer({
				id: 'cluster-count',
				type: 'symbol',
				source: SOURCE,
				filter: ['has', 'point_count'],
				layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
				paint: { 'text-color': '#0e0e13' }
			})

			map.addLayer({
				id: 'shop',
				type: 'circle',
				source: SOURCE,
				filter: ['!', ['has', 'point_count']],
				paint: {
					'circle-color': '#ba5c16',
					'circle-stroke-color': '#fdffff',
					'circle-stroke-width': 2,
					'circle-radius': 7
				}
			})

			scheduleLoad()
		})

		map.on('moveend', scheduleLoad)

		// A cluster is a zoom affordance, not a destination: clicking one zooms to the level where it breaks
		// apart, which is what a person expects and what stops a dense city from being one permanent blob.
		map.on('click', 'clusters', (event) => {
			const feature = event.features?.[0]
			if (feature === undefined) return

			const target = toLngLat((feature.geometry as Point).coordinates)
			if (target === undefined) return

			const clusterId = feature.properties.cluster_id as number
			void (map.getSource(SOURCE) as maplibregl.GeoJSONSource).getClusterExpansionZoom(clusterId).then((expansion) => {
				if (disposed) return
				map.easeTo({ center: toMutableLngLat(target), zoom: expansion })
			})
		})

		/*
		 * A popup with a real `<a href>`, rather than a click that navigates straight to the shop.
		 *
		 * A pin is a few pixels wide and a mis-tap on a phone is common; sending someone to a different page
		 * on a mis-tap is a much worse outcome than showing them a name and letting them confirm. The anchor
		 * is also the only reason the pins are reachable at all for someone who cannot use a pointer.
		 */
		map.on('click', 'shop', (event) => {
			const feature = event.features?.[0]
			if (feature === undefined) return

			const anchorAt = toLngLat((feature.geometry as Point).coordinates)
			if (anchorAt === undefined) return

			const slug = String(feature.properties.slug)
			const name = String(feature.properties.publicName)
			const anchor = document.createElement('a')
			anchor.href = `/shop/${encodeURIComponent(slug)}`
			anchor.textContent = name
			anchor.className = 'font-semibold underline'

			new maplibregl.Popup().setLngLat(toMutableLngLat(anchorAt)).setDOMContent(anchor).addTo(map)
		})

		for (const layer of ['clusters', 'shop']) {
			map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
			map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
		}

		return () => {
			disposed = true
			clearTimeout(timer)
			map.remove()
			mapRef.current = null
		}
		// The map is created once, on the render that brings the box, and mutated through its own API
		// afterwards. Re-running this on a prop change would tear down and rebuild a WebGL context, losing
		// the visitor's current pan and zoom.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [container])

	return (
		<div className="relative">
			<div ref={setContainer} style={{ height: 'var(--map-height)' }} className="w-full rounded-box" />
			{truncated && (
				<p className="absolute right-2 bottom-2 rounded-box bg-white/90 px-2 py-1 text-xs text-slate-600">
					Showing the first {MAX_PINS} shops in view — zoom in for the rest
				</p>
			)}
		</div>
	)
}

export default ShopMap
