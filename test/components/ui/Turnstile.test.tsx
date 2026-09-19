import { act, render, screen, waitFor } from '@testing-library/react'
import type { ComponentType } from 'react'
import type { Mock } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TurnstileProps } from '@/components/ui/Turnstile'

const SCRIPT_ID = 'cf-turnstile-script'
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const SITE_KEY = '0x4AAAAAAABBBBBBBBCCCCCC'

type RenderFn = NonNullable<typeof globalThis.turnstile>['render']
type RenderOptions = Parameters<RenderFn>[1]

interface WidgetApi {
	// Typed with the real signature: a bare `vi.fn()` records calls as `[]`, so reading the options argument
	// off `mock.calls[0][1]` is an index into an empty tuple rather than the object the widget was given.
	readonly render: Mock<RenderFn>
	readonly remove: ReturnType<typeof vi.fn>
	/** The options the last `render` call was given, for firing its callbacks. */
	readonly options: () => RenderOptions
}

/**
 * A stand-in for the script Cloudflare would have loaded.
 *
 * jsdom does not fetch `<script src>` — `resources: 'usable'` is not set, and turning it on would have
 * this suite make a real request to a third party on every run. So the script element is real, its
 * `load` event is fired by hand, and this object is what the component finds on `globalThis` afterwards.
 */
const widgetApi = (): WidgetApi => {
	const render = vi.fn<RenderFn>(() => 'widget-1')
	const remove = vi.fn()

	vi.stubGlobal('turnstile', { render, remove })

	return { render, remove, options: () => render.mock.calls[0]?.[1] as RenderOptions }
}

/**
 * ⚠️ Re-imported per test, and this is not ceremony.
 *
 * The module caches the script load in a module-scoped promise — deliberately, so two widgets mounting
 * in the same tick await one load instead of appending two tags. A suite that imported it once would
 * carry the first test's resolved promise into every later test, and the "retries after a failure"
 * assertion below would pass without the reset that makes it true.
 */
const loadTurnstile = async (siteKey: string): Promise<ComponentType<TurnstileProps>> => {
	vi.stubEnv('VITE_TURNSTILE_SITE_KEY', siteKey)
	vi.resetModules()

	const module = await import('@/components/ui/Turnstile')
	return module.Turnstile
}

/** Fires the `load` the browser would have fired once the script arrived. */
const scriptLoads = async (): Promise<void> => {
	const script = await waitFor(() => {
		const found = document.getElementById(SCRIPT_ID)
		expect(found).not.toBeNull()
		return found as HTMLScriptElement
	})

	await act(async () => {
		script.dispatchEvent(new Event('load'))
		await Promise.resolve()
	})
}

/** Fires the `error` a blocked or offline request would produce. */
const scriptFails = async (): Promise<void> => {
	const script = await waitFor(() => {
		const found = document.getElementById(SCRIPT_ID)
		expect(found).not.toBeNull()
		return found as HTMLScriptElement
	})

	await act(async () => {
		script.dispatchEvent(new Event('error'))
		await Promise.resolve()
	})
}

const mount = async (siteKey = SITE_KEY) => {
	const onToken = vi.fn()
	const api = widgetApi()
	const Turnstile = await loadTurnstile(siteKey)
	const result = render(<Turnstile onToken={onToken} />)

	return { ...result, api, onToken }
}

beforeEach(() => {
	document.getElementById(SCRIPT_ID)?.remove()
})

afterEach(() => {
	vi.unstubAllEnvs()
	// Explicit, rather than relying solely on the runner's own global-stub teardown: a widget from a test
	// that did not unmount cleanly must not find a *previous* test's mock still on `globalThis` and call
	// into it after that test's assertions have already run.
	vi.unstubAllGlobals()
	document.getElementById(SCRIPT_ID)?.remove()
})

describe('Turnstile without a site key', () => {
	/*
	 * ⚠️ An empty `VITE_TURNSTILE_SITE_KEY` disables the widget and the form still submits. That is the
	 * normal state of a developer machine and of every test run here, and it is safe because the *server*
	 * decides: `guardPublicWrite` verifies a token only when it holds a secret key of its own, so a
	 * deployment with the secret configured rejects the tokenless request this component would send.
	 * The client cannot weaken the gate by not rendering — it can only fail to help.
	 */
	it('renders nothing', async () => {
		const { container } = await mount('')

		expect(container).toBeEmptyDOMElement()
	})

	// And asks a third-party origin for nothing. Loading the script on a dev box would hand Cloudflare a
	// request per page for a widget that cannot work.
	it('loads no third-party script', async () => {
		await mount('')

		expect(document.getElementById(SCRIPT_ID)).toBeNull()
	})

	it('never asks for a token', async () => {
		const { api, onToken } = await mount('')

		expect(api.render).not.toHaveBeenCalled()
		expect(onToken).not.toHaveBeenCalled()
	})
})

describe('loading the script', () => {
	/*
	 * On demand rather than in `<head>`: it is third-party JavaScript on the critical path of four pages
	 * out of the whole site, and preloading it on the shop pages hands a third-party origin a request for
	 * every anonymous visitor who never signs in.
	 */
	it('appends the widget script when it mounts', async () => {
		await mount()

		const script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null

		expect(script).not.toBeNull()
		expect(script?.src).toBe(SCRIPT_SRC)
	})

	// Neither blocking nor render-blocking: the form around it is usable while it loads.
	it('loads it out of the critical path', async () => {
		await mount()
		const script = document.getElementById(SCRIPT_ID) as HTMLScriptElement

		expect(script.async).toBe(true)
		expect(script.defer).toBe(true)
	})

	/*
	 * ⚠️ One script per document, however many widgets ask for it. The *promise* is cached rather than a
	 * boolean, so two components mounting in the same tick await the same load — caching the boolean
	 * appends two tags and leaves `globalThis.turnstile` defined by whichever finished last, with the
	 * other widget rendered into a detached element.
	 */
	it('appends one script for two widgets', async () => {
		const onToken = vi.fn()
		widgetApi()
		const Turnstile = await loadTurnstile(SITE_KEY)

		render(
			<>
				<Turnstile onToken={onToken} />
				<Turnstile onToken={onToken} />
			</>
		)

		expect(document.querySelectorAll(`#${SCRIPT_ID}`)).toHaveLength(1)
	})

	// A script already in the document — a second page-load path, or a widget that mounted and unmounted
	// — resolves immediately instead of appending a duplicate.
	it('reuses a script that is already in the document', async () => {
		const existing = document.createElement('script')
		existing.id = SCRIPT_ID
		existing.src = SCRIPT_SRC
		document.head.append(existing)

		const { api } = await mount()

		await waitFor(() => {
			expect(api.render).toHaveBeenCalled()
		})
		expect(document.querySelectorAll(`#${SCRIPT_ID}`)).toHaveLength(1)
	})
})

describe('rendering the widget', () => {
	it('renders it once the script has loaded', async () => {
		const { api } = await mount()
		await scriptLoads()

		expect(api.render).toHaveBeenCalledTimes(1)
	})

	it('renders it with the site key it was configured with', async () => {
		const { api } = await mount()
		await scriptLoads()

		expect(api.options().sitekey).toBe(SITE_KEY)
	})

	it('renders it into an element of its own', async () => {
		const { api, container } = await mount()
		await scriptLoads()

		expect(container).toContainElement(api.render.mock.calls[0]?.[0] as HTMLElement)
	})

	it('renders it in the light theme the rest of the app uses', async () => {
		const { api } = await mount()
		await scriptLoads()

		expect(api.options().theme).toBe('light')
	})

	/*
	 * The effect can be torn down while the script is in flight — a customer who navigated away from the
	 * login form. Rendering into the unmounted node would leak a widget nothing can ever remove.
	 */
	it('does not render into a component that already unmounted', async () => {
		const { api, unmount } = await mount()
		unmount()
		await scriptLoads()

		expect(api.render).not.toHaveBeenCalled()
	})

	// The script can resolve without defining the global — an ad blocker answering the request with an
	// empty body does exactly this. It must not throw; the form still submits and the server still decides.
	it('survives a script that loaded but defined nothing', async () => {
		// ⚠️ "Survives" is the claim, and nothing on the page can make it. The component starts the widget with
		// `void start()`, so a version that skipped the `undefined` check would throw reading `.render` inside a
		// promise nobody awaits: the DOM and `onToken` look exactly as they do below, and the throw surfaces
		// only as a run-level unhandled rejection beside a passing test — which the mutation gate records as
		// RuntimeError, a status its score leaves out, rather than as a kill.
		const rejections: unknown[] = []
		const onRejection = (reason: unknown) => rejections.push(reason)
		process.on('unhandledRejection', onRejection)

		try {
			const onToken = vi.fn()
			vi.stubGlobal('turnstile', undefined)
			const Turnstile = await loadTurnstile(SITE_KEY)
			render(<Turnstile onToken={onToken} />)

			await scriptLoads()

			expect(onToken).not.toHaveBeenCalled()
			expect(screen.queryByRole('alert')).not.toBeInTheDocument()

			// Node raises `unhandledRejection` once the microtask queue that produced it has drained.
			await new Promise((resolve) => setTimeout(resolve, 0))
			expect(rejections).toEqual([])
		} finally {
			process.off('unhandledRejection', onRejection)
		}
	})
})

describe('the token', () => {
	it('goes up to the form when Cloudflare issues one', async () => {
		const { api, onToken } = await mount()
		await scriptLoads()

		act(() => {
			api.options().callback('a-turnstile-token')
		})

		expect(onToken).toHaveBeenCalledWith('a-turnstile-token')
	})

	/*
	 * ⚠️ An expired token is worse than no token: the form would send a string the server rejects, and the
	 * failure reads as "wrong password" rather than "prove you are human again".
	 */
	it('is withdrawn when it expires', async () => {
		const { api, onToken } = await mount()
		await scriptLoads()

		act(() => {
			api.options()['expired-callback']()
		})

		expect(onToken).toHaveBeenCalledWith(null)
	})

	it('is withdrawn when the widget errors', async () => {
		const { api, onToken } = await mount()
		await scriptLoads()

		act(() => {
			api.options()['error-callback']()
		})

		expect(onToken).toHaveBeenCalledWith(null)
	})
})

describe('when the script cannot load', () => {
	/*
	 * ⚠️ The CSP has to list the script origin in both `script-src` **and** `frame-src` — the widget
	 * renders in an iframe. A strict CSP missing either shows an empty box and no console error worth
	 * reading, which is exactly the failure this message exists to make visible.
	 */
	it('tells the customer, out loud', async () => {
		await mount()
		await scriptFails()

		expect(await screen.findByRole('alert')).toHaveTextContent('The verification widget could not load')
	})

	it('says nothing while it is still loading', async () => {
		await mount()

		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	it('renders no widget', async () => {
		const { api } = await mount()
		await scriptFails()

		expect(api.render).not.toHaveBeenCalled()
	})

	/*
	 * ⚠️ The cached promise is reset on failure, so a later mount retries. Left cached, every subsequent
	 * form in the session would await a promise that already rejected — the widget would never appear
	 * again until a full reload, on a network blip that lasted one request.
	 */
	it('retries on the next mount rather than awaiting a promise that already failed', async () => {
		const { api, unmount } = await mount()
		await scriptFails()
		unmount()

		const onToken = vi.fn()
		const module = await import('@/components/ui/Turnstile')
		render(<module.Turnstile onToken={onToken} />)

		await scriptLoads()

		expect(api.render).toHaveBeenCalledTimes(1)
	})
})

describe('the cached script load', () => {
	/*
	 * ⚠️ Asserted through the exported `loadScript` rather than through the component, because the component
	 * is what makes it unobservable: it catches the rejection and renders one fixed sentence, so from the
	 * outside a blocked script, a 404 and a CSP violation are the same event. The message is what a
	 * developer reads in a console or a Sentry breadcrumb when the widget silently fails to appear, and it
	 * is the only description of the failure that survives the catch.
	 */
	it('rejects with a message that names what failed', async () => {
		vi.stubEnv('VITE_TURNSTILE_SITE_KEY', SITE_KEY)
		vi.resetModules()
		const { loadScript } = await import('@/components/ui/Turnstile')

		// The assertion is attached *before* the failure is fired. Awaiting `scriptFails()` first would let
		// the rejection reach the microtask queue with no handler on it, and vitest reports that as an
		// unhandled rejection — a run-level error beside a passing test.
		const rejects = expect(loadScript()).rejects.toThrow('Turnstile failed to load')

		await scriptFails()
		await rejects
	})

	// One promise for every caller, which is the whole reason the cache holds a promise rather than a flag.
	it('hands the same promise to a second caller', async () => {
		vi.stubEnv('VITE_TURNSTILE_SITE_KEY', SITE_KEY)
		vi.resetModules()
		const { loadScript } = await import('@/components/ui/Turnstile')

		expect(loadScript()).toBe(loadScript())

		await scriptLoads()
	})
})

describe('unmounting', () => {
	/*
	 * The widget is removed by id. Without this an unmounted login form leaves a live Turnstile challenge
	 * attached to a detached node, and Cloudflare's script keeps a timer on it for the life of the tab.
	 */
	it('removes the widget it rendered', async () => {
		const { api, unmount } = await mount()
		await scriptLoads()

		unmount()

		expect(api.remove).toHaveBeenCalledWith('widget-1')
	})

	it('removes nothing when nothing was rendered', async () => {
		const { api, unmount } = await mount()

		unmount()

		expect(api.remove).not.toHaveBeenCalled()
	})

	/*
	 * ⚠️ `onToken` is in the dependency list, and the prop's doc comment says it must be stable for exactly
	 * this reason: a new function per render tears the widget down and rebuilds it, which on a login form
	 * means a fresh challenge on every keystroke.
	 *
	 * Tested rather than assumed, because the list is one edit away from `[]` — and an empty list would
	 * leave the widget holding the first `onToken` it ever saw, quietly handing the token to a callback the
	 * form has already replaced.
	 */
	it('rebuilds the widget when onToken is replaced', async () => {
		const api = widgetApi()
		const Turnstile = await loadTurnstile(SITE_KEY)
		const { rerender } = render(<Turnstile onToken={vi.fn()} />)
		await scriptLoads()

		await act(async () => {
			rerender(<Turnstile onToken={vi.fn()} />)
			await Promise.resolve()
		})

		expect(api.remove).toHaveBeenCalledWith('widget-1')
		await waitFor(() => {
			expect(api.render).toHaveBeenCalledTimes(2)
		})
	})

	// The global can be gone by then — a `remove` on `undefined` would throw inside React's cleanup,
	// which surfaces as an unrelated render error in whatever mounts next.
	it('survives the script having vanished', async () => {
		const { unmount } = await mount()
		await scriptLoads()
		vi.stubGlobal('turnstile', undefined)

		expect(() => {
			unmount()
		}).not.toThrow()
	})
})

describe('Turnstile snapshot', () => {
	it('renders its container', async () => {
		const { container } = await mount()

		expect(container.firstChild).toMatchSnapshot()
	})

	it('renders the failure message when the script cannot load', async () => {
		const { container } = await mount()
		await scriptFails()

		expect(container.firstChild).toMatchSnapshot()
	})
})
