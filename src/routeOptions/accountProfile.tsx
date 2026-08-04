import { PersonalDataForm } from '@/features/account/PersonalDataForm'

/**
 * `/account` — the profile screen, and the index route of the account layout.
 *
 * No `head` of its own. The layout above already emits a `noIndex` head for the whole subtree, and a
 * child that repeated it would produce two `<title>` tags for one page — TanStack Router merges heads
 * along the matched chain, it does not replace them. The only reason a child here would define one is to
 * change the title, and "Your account" is right for all three.
 */
const AccountProfile = () => (
	<section aria-label="Your details">
		<h2 className="text-lg font-medium text-palette-bg">Your details</h2>
		<p className="mt-1 mb-4 text-sm text-slate-600">Optional, and only used to reach you about your orders.</p>

		<PersonalDataForm />
	</section>
)

export const accountProfileRouteOptions = { component: AccountProfile }
