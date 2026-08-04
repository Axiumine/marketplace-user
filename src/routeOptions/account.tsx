import { Outlet } from '@tanstack/react-router'

import { AccountGate } from '@/features/account/AccountGate'
import { AccountNav } from '@/features/account/AccountNav'
import { headFor } from '@/lib/seo'

/**
 * `/account` — the layout every private screen sits under, and the boundary between the two halves of
 * this app.
 *
 * ⚠️ **`ssr: false`, and this is the one place the flag appears.** It is inherited by every child route,
 * which is exactly why the private area is one subtree rather than three sibling routes. Three reasons,
 * in order of how badly each one bites:
 *
 * 1. **Cache poisoning.** The public HTML is cached by nginx and served to whoever asks. Server-rendering
 *    a page that contains one customer's name and addresses puts that page one misconfigured `Vary` away
 *    from being handed to the next visitor. A shell with no data in it cannot leak anything, whatever the
 *    cache does.
 * 2. **The server cannot render it anyway.** The access token lives in browser memory and the refresh
 *    cookie is httpOnly and scoped to the API paths — the SSR pass holds neither, so an SSR'd `me` query
 *    would answer 401 on every request and the "server-rendered" page would be an error state.
 * 3. **Zero SEO value.** Nothing here should ever be indexed, so the entire benefit of SSR is absent
 *    while all of its cost remains.
 *
 * `noIndex` on top of that, because `ssr: false` is not a robots directive: the shell still comes back as
 * HTML at a real URL, and a crawler that ran the JavaScript would find a login redirect rather than an
 * error. `robots.txt` disallows the prefix too — belt and braces, since the two mechanisms fail in
 * different ways.
 */
const head = () =>
	headFor({
		title: 'Your account',
		description: 'Manage your details and delivery addresses.',
		path: '/account',
		noIndex: true
	})

const Account = () => (
	<div className="mx-auto max-w-3xl px-4 py-8">
		<h1 className="text-2xl font-semibold text-palette-bg">Your account</h1>

		<div className="mt-4 border-b border-slate-200 pb-3">
			<AccountNav />
		</div>

		{/*
		 * The gate is *inside* the layout, not around it: the navigation and the heading render while the
		 * account is still loading, so the page has a shape from the first frame instead of appearing all
		 * at once. It also means sign-out stays reachable even if `me` is failing.
		 */}
		<div className="mt-6">
			<AccountGate>
				<Outlet />
			</AccountGate>
		</div>
	</div>
)

export const accountRouteOptions = { ssr: false as const, head, component: Account }
