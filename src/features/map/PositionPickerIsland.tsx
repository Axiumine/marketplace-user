import { ClientOnly } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

import type { PositionPickerProps } from './PositionPicker'

/**
 * The address pin map, as an island — the same three mechanisms as `MapIsland`, for the same reasons.
 *
 * - `lazy(() => import(...))` keeps MapLibre out of the chunk the account area is compiled into. Route
 *   files here do not code-split, so a static import would put ~950 KB into the entry chunk of every page
 *   on the site to serve a map that only appears once a customer opens an address form.
 * - `ClientOnly` stops a server render of a module that reaches for `window` and WebGL at module scope.
 *   `/account/*` is `ssr: false` today and this gate is what keeps that a routing decision rather than a
 *   load-bearing one — turning SSR on for an account route must fail for the reasons in `CLAUDE.md`, not
 *   because a map threw.
 * - The placeholder carries `--map-pick-height`, the height the map will occupy. ⚠️ The CLS fix: an island
 *   mounting into a zero-height box shoves the fields below it down the page. Never render the fallback as
 *   `null`.
 *
 * The map is furniture the form can do without: the position is optional, the geocoder above the form
 * fills it in without a pointer, and an address with no position is saved all the same.
 */
const PositionPickerLazy = lazy(async () => import('./PositionPicker'))

const Placeholder = () => (
	<div
		style={{ height: 'var(--map-pick-height)' }}
		className="w-full animate-pulse rounded-box border border-slate-200 bg-palette-bg1"
		aria-hidden="true"
	/>
)

export const PositionPickerIsland = (props: PositionPickerProps) => (
	<ClientOnly fallback={<Placeholder />}>
		<Suspense fallback={<Placeholder />}>
			<PositionPickerLazy {...props} />
		</Suspense>
	</ClientOnly>
)
