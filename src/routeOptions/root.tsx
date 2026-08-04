import { HeadContent, Outlet, Scripts, useRouteContext } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Provider as UrqlProvider } from 'urql'

import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { headFor, SITE_NAME } from '@/lib/seo'

import appCss from '../styles.css?url'

/**
 * The document.
 *
 * `shellComponent` is the root route's own hook for owning `<html>` — everything React renders on the
 * server starts here, which is why the client entry hydrates `document` and not a `div`. There is no
 * `index.html` in this repo.
 *
 * `lang="it"` is a market statement, the same one `it-IT` makes in `src/lib/format.ts`. The interface
 * strings are English; the shops, the addresses and the item descriptions are Italian, and `lang` is
 * read by screen readers and by search engines as a claim about the *content*, not about the chrome.
 *
 * ⚠️ `<HeadContent />` and `<Scripts />` are not decoration. The first is where every route's `head()`
 * output is actually emitted — without it, the title, the canonical link and the JSON-LD of every page
 * on the site silently vanish from the server HTML, which is the one failure mode this whole app exists
 * to avoid. The second injects the module preloads and the hydration payload; without it the page is
 * permanently static.
 */
const Shell = ({ children }: { children: ReactNode }) => (
	<html lang="it">
		<head>
			<HeadContent />
		</head>
		<body>
			<a href="#main" className="skip-link">
				Skip to content
			</a>
			{children}
			<Scripts />
		</body>
	</html>
)

/**
 * Everything inside the document: the chrome, and the matched route.
 *
 * The urql provider is mounted from the **router context** rather than from a module-level client, and
 * that is the SSR-safety rule of this app written as code. `getRouter()` runs once per request and puts
 * a fresh client in the context; a `Provider value={importedClient}` here would share one document cache
 * between every visitor the Node process is serving.
 *
 * `<main id="main">` is the skip link's target and the landmark a screen reader jumps to.
 */
const Layout = () => {
	const { gql } = useRouteContext({ from: '__root__' })

	return (
		<UrqlProvider value={gql}>
			<div className="flex min-h-full flex-col">
				<Header />
				<main id="main" className="flex-1">
					<Outlet />
				</main>
				<Footer />
			</div>
		</UrqlProvider>
	)
}

/**
 * The site-wide head.
 *
 * `charSet` first, before anything that could contain a non-ASCII byte: a browser that meets one earlier
 * has already guessed an encoding and may restart the parse.
 *
 * The stylesheet is a `link` in `head()` rather than a bare `import './styles.css'` because that is what
 * puts it in the **server's** HTML. A CSS import processed only by the client bundle arrives after
 * hydration, and the first paint — the one Largest Contentful Paint measures — is unstyled.
 *
 * `preconnect` to the map tile origin costs nothing when it is same-origin (the default) and saves a
 * full TLS handshake when PMTiles is served from a CDN.
 */
const head = () => ({
	meta: [
		{ charSet: 'utf-8' },
		{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
		...headFor({
			title: SITE_NAME,
			description: 'Find shops near you and browse what they offer.',
			path: '/'
		}).meta
	],
	links: [
		{ rel: 'stylesheet', href: appCss },
		{ rel: 'icon', href: '/favicon.ico' }
	]
})

export const rootRouteOptions = {
	head,
	shellComponent: Shell,
	component: Layout
}
