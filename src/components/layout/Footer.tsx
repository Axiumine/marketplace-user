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
				{/*
				 * ⚠️ The seller's registration is a link of its own, next to the customer's, and it has to be:
				 * the two write different collections and there is no path from one account to the other, so a
				 * shop owner who takes "Create an account" to mean theirs ends up with a customer account they
				 * cannot trade from and an address that can no longer be registered as a seller. The footer is
				 * the only nav the SSR pages share, which makes it the one place the choice is always offered.
				 */}
				<Link to="/register/seller" className="hover:text-palette-bg">
					Sell on Marketplace
				</Link>
				<Link to="/login" className="hover:text-palette-bg">
					Sign in
				</Link>
				{/*
				 * ⚠️ The privacy link belongs *here* rather than on the pages that happen to be relevant. The
				 * page states the log retention the edge configures, and a visitor is logged on
				 * every request — including the ones that never reach a page with a link on it. The footer is
				 * the only element rendered by the root route, so this is the one place where "reachable from
				 * every page" is a property of the layout instead of a checklist.
				 */}
				<Link to="/privacy" className="hover:text-palette-bg">
					Privacy
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
