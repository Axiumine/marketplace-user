import { Link } from '@tanstack/react-router'

import { AuthCard } from '@/features/auth/AuthCard'
import { LoginForm } from '@/features/auth/LoginForm'
import { headFor } from '@/lib/seo'

/**
 * `/login`.
 *
 * ⚠️ **Server-rendered, and `noIndex`.** The two are not in tension: SSR is about how fast the form
 * paints, `noindex` is about whether the URL belongs in a search index. It does not — a login page ranks
 * for the brand name and gives a searcher nothing — but the page is still pure static markup with no
 * session in it, so rendering it on the server costs nothing and saves a round trip on the one page
 * somebody arrives at with an intent to act.
 *
 * `noindex, follow` rather than `noindex, nofollow` (see `headFor`): the links out of here lead to pages
 * that *are* meant to be indexed.
 *
 * There is no loader and no `beforeLoad` redirect for an already-signed-in visitor. The session lives in
 * module state that only exists in the browser, so a loader cannot see it — and a server that guessed
 * would emit HTML the first client render contradicts. If they are signed in already, the account link
 * in the header is right there.
 *
 * ⚠️ What that leaves — a customer reaching this form without a page load, and signing in as somebody
 * else inside a urql client that still holds the first account's `Me` — is closed in `LoginForm` instead,
 * by leaving the page on success rather than navigating
 * ([`ADR-051`](../../../docs/devprotocol/phase3/adr/ADR-051-a-session-exit-is-a-page-load.md)). A guard
 * here would have to be a redirect the server cannot decide; a load is decided by the browser, after the
 * only event that can change the answer.
 */
const head = () =>
	headFor({
		title: 'Sign in',
		description: 'Sign in to your account to manage your details and addresses.',
		path: '/login',
		noIndex: true
	})

const Login = () => (
	<AuthCard
		title="Sign in"
		footer={
			<>
				No account yet?{' '}
				<Link to="/register" className="underline">
					Create one
				</Link>
				.
			</>
		}
	>
		<LoginForm />
	</AuthCard>
)

export const loginRouteOptions = { head, component: Login }
