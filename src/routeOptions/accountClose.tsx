import { CloseAccount } from '@/features/account/CloseAccount'

/**
 * `/account/close` — close your own account. Head comes from the layout; see `accountProfile.tsx`.
 *
 * ⚠️ **A screen of its own rather than a card at the bottom of the password page**, which is where a
 * fourth control is cheapest to bolt on. Two reasons, and neither is layout: a destructive action sitting
 * under a form is one mis-aimed press away from the wrong outcome, and this screen is the only one in the
 * private area that ends the session it is standing in — nothing above it survives the press, so nothing
 * above it should be on the same page.
 */
const AccountClose = () => (
	<section aria-label="Close my account">
		<h2 className="text-lg font-medium text-palette-bg">Close my account</h2>
		<p className="mt-1 mb-4 text-sm text-slate-600">
			Read what this does before you tick the box. It can be undone for thirty days, and not after them.
		</p>

		<CloseAccount />
	</section>
)

export const accountCloseRouteOptions = { component: AccountClose }
