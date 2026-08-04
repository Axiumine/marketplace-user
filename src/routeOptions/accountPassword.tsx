import { ChangePasswordForm } from '@/features/account/ChangePasswordForm'

/** `/account/password` — change the password. Head comes from the layout; see `accountProfile.tsx`. */
const AccountPassword = () => (
	<section aria-label="Password">
		<h2 className="text-lg font-medium text-palette-bg">Password</h2>
		<p className="mt-1 mb-4 text-sm text-slate-600">
			Changing it here keeps you signed in on this device. Other devices stay signed in too.
		</p>

		<ChangePasswordForm />
	</section>
)

export const accountPasswordRouteOptions = { component: AccountPassword }
