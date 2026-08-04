import { useEffect, useRef, useState } from 'react'

import { env } from '@/env'

/**
 * The Cloudflare Turnstile widget, as a controlled input that hands a token upwards.
 *
 * ⚠️ **An empty `VITE_TURNSTILE_SITE_KEY` disables it entirely, and the form still submits.** That is
 * the normal state of a developer machine and of the integration suites, and it is safe because the
 * server is the side that decides: `guardPublicWrite` verifies a token only when it holds a secret key
 * of its own, so a deployment with the secret configured rejects the tokenless request this component
 * would send. The client cannot weaken the gate by not rendering — it can only fail to help.
 *
 * The script is loaded on demand rather than in `<head>`: it is third-party JavaScript on the critical
 * path of four pages out of the whole site, and preloading it on the shop pages would hand a
 * third-party origin a request for every anonymous visitor who never signs in.
 *
 * ⚠️ The script URL must be in the CSP `script-src` and `frame-src` — the widget renders in an iframe.
 * See docs/nginx/security.conf; a strict CSP without those two entries fails silently, showing an empty
 * box and no console error worth reading.
 */
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const SCRIPT_ID = 'cf-turnstile-script'

interface TurnstileApi {
	render: (
		element: HTMLElement,
		options: {
			sitekey: string
			callback: (token: string) => void
			'expired-callback': () => void
			'error-callback': () => void
			theme: 'light'
		}
	) => string
	remove: (widgetId: string) => void
}

declare global {
	var turnstile: TurnstileApi | undefined
}

/**
 * Loads the script once per document, however many widgets ask for it.
 *
 * The promise is cached rather than the boolean, so two components mounting in the same tick await the
 * same load instead of appending two `<script>` tags — a race that leaves `window.turnstile` defined by
 * whichever finished last and the other widget rendered into a detached element.
 */
let scriptPromise: Promise<void> | undefined

const loadScript = (): Promise<void> => {
	scriptPromise ??= new Promise<void>((resolve, reject) => {
		const existing = document.getElementById(SCRIPT_ID)
		if (existing !== null) {
			resolve()
			return
		}

		const script = document.createElement('script')
		script.id = SCRIPT_ID
		script.src = SCRIPT_SRC
		script.async = true
		script.defer = true
		script.addEventListener('load', () => {
			resolve()
		})
		script.addEventListener('error', () => {
			// Reset, so a later mount retries rather than awaiting a promise that will never settle again.
			scriptPromise = undefined
			reject(new Error('Turnstile failed to load'))
		})

		document.head.append(script)
	})

	return scriptPromise
}

export interface TurnstileProps {
	/**
	 * Receives the token, or `null` when it expires or the widget errors.
	 *
	 * Must be stable across renders — it is in the effect's dependency list, and a new function per
	 * render tears the widget down and rebuilds it on every keystroke in the form around it. Wrap it in
	 * `useCallback`, or hoist it.
	 */
	readonly onToken: (token: string | null) => void
}

export const Turnstile = ({ onToken }: TurnstileProps) => {
	const container = useRef<HTMLDivElement>(null)
	const [failed, setFailed] = useState(false)
	const siteKey = env.turnstileSiteKey

	useEffect(() => {
		if (siteKey === '') return

		let widgetId: string | undefined
		let cancelled = false

		const start = async () => {
			try {
				await loadScript()
			} catch {
				setFailed(true)
				return
			}

			// The effect can have been torn down while the script was in flight; rendering into the
			// unmounted node would leak a widget nothing can ever remove.
			if (cancelled || container.current === null || globalThis.turnstile === undefined) return

			widgetId = globalThis.turnstile.render(container.current, {
				sitekey: siteKey,
				callback: onToken,
				// An expired token is worse than no token: the form would send a string the server rejects,
				// and the failure reads as "wrong password" rather than "prove you are human again".
				'expired-callback': () => {
					onToken(null)
				},
				'error-callback': () => {
					onToken(null)
				},
				theme: 'light'
			})
		}

		void start()

		return () => {
			cancelled = true
			if (widgetId !== undefined) globalThis.turnstile?.remove(widgetId)
		}
	}, [siteKey, onToken])

	if (siteKey === '') return null

	return (
		<div>
			<div ref={container} />
			{failed && (
				<p role="alert" className="text-xs text-app-error">
					The verification widget could not load. Check your connection and reload the page.
				</p>
			)}
		</div>
	)
}
