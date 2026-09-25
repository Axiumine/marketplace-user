import type { AnyRouter } from '@tanstack/react-router'
import { RouterContextProvider, RouterProvider } from '@tanstack/react-router'
import type { RenderResult } from '@testing-library/react'
import { render, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { Provider as UrqlProvider } from 'urql'
import { afterEach } from 'vitest'

import { createGraphQLClient } from '@/api/client'
import { setAccessToken } from '@/api/tokenStore'
import { clearSession, setSession } from '@/auth/session'
import { getRouter } from '@/router'

export const CUSTOMER_EMAIL = 'customer@marketplace.it'

export interface RenderOptions {
	/**
	 * Seeds the in-memory access token. Defaults to `null` — the opposite of the sibling apps' helper,
	 * because the opposite is the interesting default here: most of this app is anonymous catalogue, and
	 * `requiresAuth` keeps a public endpoint from firing a refresh it does not need. Pass a string for the
	 * private area, where a null token makes `willAuthError` send a `Refresh` first.
	 */
	token?: string | null
	/** Seeds the signed-in address. `null` leaves the store signed out, which is what a visitor is. */
	session?: string | null
	/** Where the router starts. Only read by `renderRoute` and `renderWithRouter`. */
	path?: string
}

const seed = ({ token = null, session = null }: RenderOptions): void => {
	if (token !== null) setAccessToken(token)
	if (session !== null) setSession(session)
	else clearSession()
}

/**
 * One `AbortController` per client built by the helpers below (directly, or through `getRouter`),
 * aborted in `afterEach`.
 *
 * `createGraphQLClient` registers a `window.addEventListener('online', …)` through its refresh breaker
 * that otherwise outlives the test — every one of these helpers builds a fresh client per test, and
 * without this the listener accumulates on the one jsdom `window` the whole suite shares.
 */
const clientControllers = new Set<AbortController>()

const trackedSignal = (): AbortSignal => {
	const controller = new AbortController()
	clientControllers.add(controller)

	return controller.signal
}

const buildClient = (): ReturnType<typeof createGraphQLClient> =>
	createGraphQLClient({ onSessionLost: clearSession, signal: trackedSignal() })

afterEach(() => {
	for (const controller of clientControllers) controller.abort()
	clientControllers.clear()
})

/**
 * Renders a component that needs the urql client but touches no router — the `ui/` primitives and the
 * forms built only from them.
 */
export const renderWithClient = (ui: ReactElement, options: RenderOptions = {}): RenderResult => {
	seed(options)

	return render(<UrqlProvider value={buildClient()}>{ui}</UrqlProvider>)
}

export interface RouterRenderResult extends RenderResult {
	readonly router: AnyRouter
}

/**
 * Points jsdom's URL at `path` before the router reads it.
 *
 * `getRouter()` takes no history — it is the app's real entry factory, called by `client.tsx` and by
 * `server.ts` with no arguments — so a memory history cannot be handed to it. In a browser environment
 * `createRouter` builds a `createBrowserHistory()` that reads `window.location`, and moving the location
 * first is therefore the supported way to start a test anywhere but `/`. The alternative — assembling a
 * second `createRouter({ routeTree, … })` here — would test every option except the ones the app
 * actually ships.
 */
const locate = (path: string): void => {
	window.history.replaceState(null, '', path)
}

/**
 * Renders a component that renders a `Link`, without mounting the route it points at.
 *
 * `RouterContextProvider` is the router's own low-level provider: it puts the router in React context
 * and renders its children, where `RouterProvider` would render the matched route tree instead. That is
 * what makes an isolated test of `ShopCard` or `Pagination` possible — `Link` resolves and builds a real
 * `href` against the real route tree, so a typo in a path is a failed assertion rather than a link that
 * silently 404s in production.
 *
 * The router is loaded first so `useRouterState` has a location to report; a `Link` computing its active
 * state against a router that never matched anything reports every link inactive.
 */
export const renderWithRouter = async (ui: ReactElement, options: RenderOptions = {}): Promise<RouterRenderResult> => {
	seed(options)
	locate(options.path ?? '/')

	const router = getRouter(trackedSignal())
	await router.load()

	const result = render(
		<RouterContextProvider router={router as never}>
			<UrqlProvider value={buildClient()}>{ui}</UrqlProvider>
		</RouterContextProvider>
	)

	return { ...result, router }
}

/**
 * Renders the real route tree at a real URL.
 *
 * Routes are tested through the router rather than by calling their `component` by hand, because the URL
 * *is* their input: every listing route reads `?page=` through a zod `validateSearch`, and the component
 * reads what the loader put in the match. A component mounted directly is tested against props no
 * visitor can produce.
 *
 * ⚠️ The root route's `shellComponent` renders `<html>`, so this mounts a document inside the Testing
 * Library container. That is the real shell and the real `<head>` handling, which is the point — the
 * skip link and the `lang` attribute are only observable here.
 */
export const renderRoute = async (path: string, options: RenderOptions = {}): Promise<RouterRenderResult> => {
	seed(options)
	locate(path)

	const router = getRouter(trackedSignal())
	await router.load()

	const result = render(<RouterProvider router={router as never} />)

	await waitFor(() => {
		expect(router.state.status).toBe('idle')
	})

	return { ...result, router }
}
