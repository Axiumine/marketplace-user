import 'maplibre-gl/dist/maplibre-gl.css'

import * as maplibregl from 'maplibre-gl'
import { useCallback, useEffect, useRef, useState } from 'react'

import { env } from '@/env'
import { toMutableLngLat } from '@/lib/geo'

import { registerPmtilesProtocol } from './pmtiles'

/**
 * The map a customer places their own address on, and the second module in the app that pulls MapLibre
 * into a bundle.
 *
 * ⚠️ Never import this file statically. Like `ShopMap` it is reachable only through an island —
 * `PositionPickerIsland` — and for the same two reasons: MapLibre is ~950 KB that no page without a map
 * should download, and this module touches `window` and a WebGL context at module scope, so a server
 * render of it throws rather than degrading. Route files here do not code-split (see `CLAUDE.md`), which
 * means a static import from the account area would land that payload in the entry chunk of **every**
 * page, catalogue pages included.
 *
 * ⚠️ **`[longitude, latitude]`, in that order, on both sides of this component.** It is GeoJSON, and it is
 * the reverse of how MapLibre's own `LngLat` object reads it out (`.lng` then `.lat`, named) and of how
 * every human says it. Swapping them does not throw — `[42.36, -71.06]` is a valid point in the Southern
 * Ocean — and the `2dsphere` index then answers "no shops near you" forever.
 *
 * **Why a pin at all, when the address field already geocodes.** A suggestion picked from Nominatim
 * carries coordinates; an address typed by hand does not, and never can — a new building, a rural road, a
 * place the geocoder has simply never heard of. Dragging the pin is the only way those addresses are ever
 * placed on the map, and placing them is what lets shops be sorted by distance from them.
 *
 * **It is a correction surface, not the primary one.** The geocoder stays the fast path and the only one
 * reachable without a pointer: a canvas cannot be dragged with a keyboard, and nothing here is the sole
 * route to a position — the position is optional, and the form says so beside this map.
 */

/**
 * Where the map opens when there is nothing to open it on: the geographic centre of the country, at a
 * zoom that shows the whole of it.
 *
 * The same point `marketplace-shopowner`'s address field falls back to, in GeoJSON order rather than its
 * `{lat, lon}` one. A map that opens on a country says "tell me where"; a map that opens at street zoom on
 * an arbitrary place says "is this it?", which is a question with a wrong answer already in it.
 */
const COUNTRY_CENTER: readonly [number, number] = [-98.5795, 39.8283]

const ZOOM_COUNTRY = 3

/** Close enough to see which side of a street a building is on, which is the precision a pin is for. */
const ZOOM_ADDRESS = 16

/** The catalogue's own pin colour, so a shop pin and an address pin are recognisably the same object. */
const PIN_COLOR = '#ba5c16'

export interface PositionPickerProps {
	/** `[lng, lat]`, GeoJSON order, or `undefined` while the address has no position at all. */
	readonly position?: readonly [number, number] | undefined
	/** Handed `[lng, lat]` whenever the customer drops the pin somewhere new. */
	readonly onPick: (position: readonly [number, number]) => void
}

export const PositionPicker = ({ position, onPick }: PositionPickerProps) => {
	/*
	 * The box MapLibre mounts into, held in state rather than in a ref — the same reason as `ShopMap`: a
	 * ref is read once, on the effect run after the first commit, and nothing re-runs the effect if the
	 * element arrives later. State makes the arrival a render.
	 */
	const [container, setContainer] = useState<HTMLDivElement | null>(null)
	const mapRef = useRef<maplibregl.Map | null>(null)
	const markerRef = useRef<maplibregl.Marker | null>(null)
	const onPickRef = useRef(onPick)

	/**
	 * True while the position in props is one this map itself just produced.
	 *
	 * ⚠️ What it buys is the map **not** moving under a gesture that just finished. Every drop writes the
	 * point to form state, which hands it straight back as a prop, and framing on every prop change would
	 * re-centre the viewport the instant the customer let go of the pin — the map would walk across the
	 * screen with every small correction. A point that arrives from anywhere else (the geocoder above the
	 * map, or the address being edited) has to be framed, because nothing else would bring it into view.
	 */
	const ownRef = useRef(false)

	/*
	 * The handlers below are wired once, when the map is built, so a closure over `onPick` would hold the
	 * first render's copy forever — and the form passes a new arrow on every render. A ref is the one thing
	 * that stays the same object while its contents follow the props.
	 */
	useEffect(() => {
		onPickRef.current = onPick
	}, [onPick])

	/**
	 * The one place a point produced by this map is announced, so the flag above and the coordinate order
	 * below are each written once rather than once per gesture.
	 *
	 * ⚠️ MapLibre hands out `{lng, lat}` named fields; what leaves here is a GeoJSON pair, longitude first.
	 */
	const emit = useCallback((at: maplibregl.LngLat) => {
		ownRef.current = true
		onPickRef.current([at.lng, at.lat])
	}, [])

	useEffect(() => {
		if (container === null) return

		registerPmtilesProtocol()

		const map = new maplibregl.Map({
			container,
			style: env.mapStyleUrl,
			center: toMutableLngLat(position ?? COUNTRY_CENTER),
			zoom: position === undefined ? ZOOM_COUNTRY : ZOOM_ADDRESS,
			// The basemap credit is a licence obligation for OSM-derived data, and this map is on a page
			// with no footer of its own to carry it.
			attributionControl: { compact: true }
		})

		mapRef.current = map
		map.addControl(new maplibregl.NavigationControl(), 'top-right')

		// A click places the pin where it was clicked and nowhere else — no easing, no zooming in. A map
		// that jumps on the click that was meant to nudge a pin two streets over is a map people stop
		// touching.
		map.on('click', (event) => {
			emit(event.lngLat)
		})

		return () => {
			markerRef.current = null
			mapRef.current = null
			map.remove()
		}
		// Built once, on the render that brings the box, and driven through its own API afterwards. Rebuilding
		// it on a prop change would tear down a WebGL context and lose the customer's pan and zoom.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [container])

	/*
	 * `lon` and `lat` rather than `position` in the dependency list: the parent builds the pair from form
	 * state, and an array is a new identity on every render even when both numbers are unchanged. Two
	 * primitives compare by value, so this runs when the point moves and not when the form re-renders
	 * around it.
	 */
	const lon = position?.[0]
	const lat = position?.[1]

	useEffect(() => {
		const map = mapRef.current
		if (map === null) return

		if (position === undefined) {
			markerRef.current?.remove()
			markerRef.current = null

			return
		}

		if (markerRef.current === null) {
			const marker = new maplibregl.Marker({ draggable: true, color: PIN_COLOR })

			// `dragend`, not `drag`: the pin is written once, where it was let go, rather than on every frame
			// of the gesture — each write is a form update, and a form that re-renders sixty times a second
			// while a pin moves is a form that stutters.
			marker.on('dragend', () => {
				emit(marker.getLngLat())
			})

			markerRef.current = marker.setLngLat(toMutableLngLat(position)).addTo(map)
		} else {
			markerRef.current.setLngLat(toMutableLngLat(position))
		}

		if (ownRef.current) ownRef.current = false
		else map.easeTo({ center: toMutableLngLat(position), zoom: ZOOM_ADDRESS })
		// `position` is read here but the pair of primitives above is what says whether it changed.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [container, lon, lat])

	return <div ref={setContainer} style={{ height: 'var(--map-pick-height)' }} className="w-full rounded-box" />
}

export default PositionPicker
