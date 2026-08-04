import { Link } from '@tanstack/react-router'

import { SITE_NAME } from '@/lib/seo'

/**
 * Site footer.
 *
 * The map attribution lives here rather than on the map itself. ⚠️ It is a licence obligation, not a
 * courtesy: OpenStreetMap data is ODbL and Protomaps' basemap is built from it, so the credit has to be
 * reachable from any page that shows a map. MapLibre draws its own attribution control inside the
 * canvas, but that control only exists once the island has hydrated — this line is in the server HTML,
 * so the obligation is met even when the map never loads.
 */
export const Footer = () => (
	<footer className="mt-16 border-t border-slate-200 bg-white">
		<div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-slate-500">
			<nav aria-label="Footer" className="flex flex-wrap gap-4">
				<Link to="/shops" className="hover:text-palette-bg">
					All shops
				</Link>
				<Link to="/register" className="hover:text-palette-bg">
					Create an account
				</Link>
				<Link to="/login" className="hover:text-palette-bg">
					Sign in
				</Link>
			</nav>
			<p>
				Map data ©{' '}
				<a href="https://www.openstreetmap.org/copyright" rel="noreferrer" className="underline">
					OpenStreetMap
				</a>{' '}
				contributors, ODbL. Basemap tiles by{' '}
				<a href="https://protomaps.com" rel="noreferrer" className="underline">
					Protomaps
				</a>
				.
			</p>
			<p>{SITE_NAME}</p>
		</div>
	</footer>
)
