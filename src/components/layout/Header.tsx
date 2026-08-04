import { Link } from '@tanstack/react-router'

import { useSession } from '@/auth/useSession'
import { SITE_NAME } from '@/lib/seo'

import { SearchBox } from './SearchBox'

/**
 * The site header: brand, search, and the one control whose content depends on who is looking.
 *
 * ⚠️ `useSession()` returns *signed out* during SSR, always — `getServerSession` is a constant. That is
 * deliberate and it is the reason this header is cacheable: the server HTML for a signed-in visitor and
 * an anonymous one is byte-identical, so a shared cache holding it cannot leak one visitor's state to
 * another. The "Account" link appears after hydration, which is a flash of the wrong link for one frame
 * and the correct trade against the alternative — server-rendering per-visitor markup on a page that
 * nginx caches.
 *
 * It is not an authorisation boundary either way. The private routes guard themselves; this only decides
 * which of two links to draw.
 */
export const Header = () => {
	const session = useSession()

	return (
		<header className="border-b border-slate-200 bg-white">
			<div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:gap-6">
				<Link to="/" className="text-lg font-semibold whitespace-nowrap text-palette-bg">
					{SITE_NAME}
				</Link>

				<SearchBox />

				<nav aria-label="Main" className="flex items-center gap-4 text-sm whitespace-nowrap">
					<Link to="/shops" className="text-slate-600 hover:text-palette-bg">
						Shops
					</Link>
					{session.signedIn ? (
						<Link to="/account" className="font-medium text-palette-bg hover:underline">
							Account
						</Link>
					) : (
						<Link to="/login" className="font-medium text-palette-bg hover:underline">
							Sign in
						</Link>
					)}
				</nav>
			</div>
		</header>
	)
}
