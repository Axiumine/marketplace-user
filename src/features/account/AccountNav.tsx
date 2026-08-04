import { Link } from '@tanstack/react-router'

import { useLogout } from '@/auth/useLogout'

/**
 * The account area's own navigation, plus sign-out.
 *
 * `activeProps` rather than a manual `useMatch` comparison: the router already knows which link is
 * current, and it sets `aria-current="page"` for us. Styling an active link without that attribute makes
 * the current page visible to sighted visitors only.
 *
 * ⚠️ `activeOptions={{ exact: true }}` on the first link is required, not cosmetic. `/account` is a
 * prefix of every other route here, so without it the profile link renders as active while the customer
 * is standing on the addresses page — two links claiming to be the current page, one of them lying.
 */
const LINK = 'rounded-box px-3 py-2 text-sm text-slate-600 hover:bg-slate-100'

/**
 * Repeats the layout classes rather than only the colours.
 *
 * `Link` concatenates `className` with `activeProps.className`, and the later one wins on a conflicting
 * Tailwind utility — but "concatenates" is behaviour of the router, not of the DOM. Spelling the box out
 * here means the active link keeps its padding even if that merge ever became a replace, and costs one
 * duplicated utility to get it.
 */
const LINK_ACTIVE = 'rounded-box px-3 py-2 text-sm bg-palette-bg text-palette-white hover:bg-palette-bg'

export const AccountNav = () => {
	const logout = useLogout()

	return (
		<nav aria-label="Account" className="flex flex-wrap items-center gap-1">
			<Link to="/account" activeOptions={{ exact: true }} className={LINK} activeProps={{ className: LINK_ACTIVE }}>
				Profile
			</Link>

			<Link to="/account/addresses" className={LINK} activeProps={{ className: LINK_ACTIVE }}>
				Addresses
			</Link>

			<Link to="/account/password" className={LINK} activeProps={{ className: LINK_ACTIVE }}>
				Password
			</Link>

			<button type="button" onClick={() => void logout()} className={`${LINK} ml-auto underline`}>
				Sign out
			</button>
		</nav>
	)
}
