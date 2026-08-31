import { FormStatus } from '@/components/ui/FormStatus'
import { AuthCard } from '@/features/auth/AuthCard'
import { ResetConfirmForm } from '@/features/auth/ResetConfirmForm'
import { readResetCredential } from '@/features/auth/resetLink'
import { ResetLinkInvalid } from '@/features/auth/ResetLinkInvalid'
import { headFor } from '@/lib/seo'

/**
 * `/reset-password/confirm` — the target of the emailed link, and a URL that carries no credential.
 *
 * ⚠️ **The address and the hash arrive in the fragment, not in the path**. The mail builds
 * `…/reset-password/confirm#/<address>/<hash>`; RFC 3986 §3.5 says a fragment is never sent, so the pair
 * exists only in this browser. Before that it was `/reset-password/$email/$hash`, and the credential was
 * in the request line of every hop — measured, it was also inside the HTML: the router dehydrates each
 * rendered match keyed by the *interpolated* path, so the pair was in the body a shared cache stores.
 *
 * Three consequences, each of them load-bearing:
 *
 * - **`ssr: false`.** The server cannot see the fragment, so there is nothing here for it to render and
 *   nothing to dehydrate. The flag makes that a property of the route rather than a lucky consequence of
 *   the URL shape: a path parameter added here later is inert instead of being a new copy of the finding.
 * - **A path of its own, not `/reset-password`.** That URL is the other half of the flow, the screen that
 *   asks for an address. Since no server sees the fragment, every mailed link would land on it and render
 *   the wrong form. It stays under the same `/reset-password` prefix on purpose — `robots.txt`, the
 *   edge's cache bypass and its log redaction all match that prefix and now cover this page unchanged.
 * - **`noIndex` all the same.** The URL is no longer a secret, but a password form that ranks is a
 *   password form bots find, and it gives a searcher nothing.
 *
 * ⚠️ **Links already in mailboxes keep the old shape for up to 60 minutes** — the lifetime koa-utils
 * gives a hash — and land on the 404 page, because `/reset-password/$email/$hash` is gone. Keeping that
 * route alive as a redirect would have kept the credential in the path and in the dehydrated body for
 * exactly as long as it stayed, which is the leak this route exists to close.
 */
const head = () =>
	headFor({
		title: 'Set a new password',
		description: 'Choose a new password for your account.',
		path: '/reset-password/confirm',
		noIndex: true
	})

/**
 * ⚠️ Said as one thing that is wrong with the link, not as three. A truncated link, a fragment a client
 * dropped and an address that would not decode are one situation for the person reading this: what they
 * have will not work, and `ResetLinkInvalid` under it is where they go next.
 */
const INCOMPLETE_LINK = 'This reset link is incomplete — the part after the # is missing.'

const ResetPasswordConfirm = () => {
	/*
	 * ⚠️ `window.location.hash` rather than the router's `useRouterState().location.hash`: the router
	 * percent-decodes and sanitises its copy before anything here could split it (`decodePath`,
	 * `router-core/dist/esm/router.js:195`). This is the one place in `src/` that reads `window` — a
	 * client-only route by the flag above, so there is no server render for it to break.
	 */
	const credential = readResetCredential(window.location.hash)

	return (
		<AuthCard title="Set a new password" intro="Choose a new password. You will use it to sign in from now on.">
			{credential === undefined ? (
				<div className="flex flex-col gap-3">
					<FormStatus tone="error" message={INCOMPLETE_LINK} />
					<ResetLinkInvalid />
				</div>
			) : (
				<ResetConfirmForm email={credential.email} hash={credential.hash} />
			)}
		</AuthCard>
	)
}

export const resetPasswordConfirmRouteOptions = { ssr: false as const, head, component: ResetPasswordConfirm }
