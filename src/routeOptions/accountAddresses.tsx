import { AddressList } from '@/features/account/AddressList'

/** `/account/addresses` — the address book. Head comes from the layout; see `accountProfile.tsx`. */
const AccountAddresses = () => (
	<section aria-label="Your addresses">
		<h2 className="text-lg font-medium text-palette-bg">Your addresses</h2>
		<p className="mt-1 mb-4 text-sm text-slate-600">Save as many as you like and mark one as the default.</p>

		<AddressList />
	</section>
)

export const accountAddressesRouteOptions = { component: AccountAddresses }
