import { getRouteApi } from '@tanstack/react-router'

import { AuthCard } from '@/features/auth/AuthCard'
import { ResetConfirmForm } from '@/features/auth/ResetConfirmForm'
import { headFor } from '@/lib/seo'

/**
 * `/reset-password/$email/$hash` — the target of the emailed link.
 *
 * The two path parameters are a credential pair, which drives three decisions here:
 *
 * - **`noIndex`.** A crawler that reached this URL would put a live reset hash in a search index. It
 *   should never reach one — nothing links here and `robots.txt` covers the prefix — but a page whose URL
 *   *is* the secret gets the meta tag as well, because `robots.txt` is a request and the meta tag is read
 *   by anything that renders the page.
 * - **The `head` uses a fixed path for the canonical**, not the real one. `headFor` would otherwise emit
 *   `<link rel="canonical" href="…/reset-password/alice@example.com/9f3c…">`, which is the hash written
 *   into the page a second time and into any analytics that scrapes canonicals.
 * - **Neither value is rendered.** See `ResetConfirmForm`.
 *
 * `email` arrives percent-encoded — an address contains `@`, and TanStack Router hands params back
 * decoded, so nothing here has to undo it. It is passed to the mutation exactly as received: the server
 * looks it up, and a mangled one fails the same flat way a wrong hash does.
 */
const route = getRouteApi('/reset-password/$email/$hash')

const head = () =>
	headFor({
		title: 'Set a new password',
		description: 'Choose a new password for your account.',
		path: '/reset-password',
		noIndex: true
	})

const ResetPasswordConfirm = () => {
	const { email, hash } = route.useParams()

	return (
		<AuthCard title="Set a new password" intro="Choose a new password. You will use it to sign in from now on.">
			<ResetConfirmForm email={email} hash={hash} />
		</AuthCard>
	)
}

export const resetPasswordConfirmRouteOptions = { head, component: ResetPasswordConfirm }
