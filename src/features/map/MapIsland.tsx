import { ClientOnly } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

import type { ShopMapProps } from './ShopMap'

/**
 * The map, as an island: server-rendered as an empty box of the right size, filled in after hydration.
 *
 * Three separate mechanisms, each doing one job, and none of them redundant:
 *
 * - `lazy(() => import(...))` keeps MapLibre out of the initial JavaScript. A page with no map never
 *   downloads it, and a page with one downloads it after the content is interactive.
 * - `ClientOnly` stops the server from rendering the child at all. Without it the SSR pass would try to
 *   construct a WebGL map in Node and throw, taking the whole page's HTML down with it — the content
 *   would be lost to fix a decoration.
 * - The placeholder carries `--map-height`, the same height the map will occupy. ⚠️ This is the CLS fix.
 *   An island that mounts into a zero-height box shoves every element below it down the page at the
 *   moment it appears, and Cumulative Layout Shift measures exactly that. Never render the fallback as
 *   `null`.
 *
 * The consequence to be honest about: **the map's contents are not in the server HTML and are not
 * indexed.** That is deliberate and it costs nothing here — every pin on it is a shop that also appears
 * as a real, crawlable link in the listing beside it. The map is a way to look at the catalogue, never
 * the only route to a page in it.
 */
const ShopMapLazy = lazy(async () => import('./ShopMap'))

const Placeholder = () => (
	<div
		style={{ height: 'var(--map-height)' }}
		className="w-full animate-pulse rounded-box border border-slate-200 bg-white"
		aria-hidden="true"
	/>
)

export const MapIsland = (props: ShopMapProps) => (
	<ClientOnly fallback={<Placeholder />}>
		<Suspense fallback={<Placeholder />}>
			<ShopMapLazy {...props} />
		</Suspense>
	</ClientOnly>
)
