import * as maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'

/**
 * The `pmtiles://` protocol handler, registered once per document.
 *
 * ⚠️ **Never import this module from anything a route loads statically.** It pulls MapLibre and pmtiles
 * into whatever chunk imports it — the same ~950 KB `ShopMap` is an island to avoid — and it touches the
 * library at module scope, so a server render of an importer throws. Its only callers are the two
 * lazily-imported map modules beside it.
 *
 * `pmtiles://` is not a scheme any browser knows. The handler teaches MapLibre to answer a tile request
 * with an HTTP **range request** into one static `.pmtiles` archive, which is the whole reason there is no
 * tile server to operate here: nginx serves one file and the client reads the bytes it needs.
 *
 * ⚠️ **The flag is module scope on purpose, and it has to be shared.** `addProtocol` overwrites silently on
 * a second call, and every map on this app mounts and unmounts on navigation — re-registering per mount
 * would churn the handler while in-flight tile requests still hold the old one. A second copy of this flag,
 * one per map component, would do exactly that the first time a page carried two maps.
 */
let protocolRegistered = false

export const registerPmtilesProtocol = () => {
	if (protocolRegistered) return

	maplibregl.addProtocol('pmtiles', new Protocol().tile)
	protocolRegistered = true
}
