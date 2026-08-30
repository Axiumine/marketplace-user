import { useCallback } from 'react'
import { useClient } from 'urql'

import { CTX_LOGOUT } from '@/api/endpoints'
import { LogoutDocument } from '@/api/operations/logout/logout'
import { clearAccessToken } from '@/api/tokenStore'
import { clearSession } from '@/auth/session'

/**
 * Ends the session, then drops the customer back on the public home page.
 *
 * ⚠️ The local teardown is **not** conditional on the server's answer, and the order matters. The
 * mutation is awaited so the Redis keys and the refresh cookie are gone before the app forgets the
 * token — but a rejection is swallowed, because a logout that failed still has to sign the customer
 * out here. Leaving them nominally signed in against a session the server may already have dropped is
 * the worse of the two outcomes: every subsequent action fails with no explanation, and the visible
 * state says everything is fine.
 *
 * Home rather than the login page: this app has a public site to fall back to, and a signed-out
 * customer reading shop pages is the normal case, not an error state.
 *
 * ⚠️ **`location.assign`, not a router navigation, and the reload is the point.** The urql client is a
 * module singleton built once per page load, and `cacheExchange` is a document cache keyed by query and
 * variables — nothing about it is keyed by *who asked*. Clearing the token and the session leaves every
 * cached result standing, so a second sign-in inside the same page load can be served the previous
 * customer's account: `Me` takes no variables at all, which makes its cache key identical across the two
 * sessions. A full load rebuilds every module at once — the cache, the token store, the session store,
 * and anything a later feature parks at module scope — which is what makes this correct by construction
 * rather than a list of stores somebody has to remember to extend.
 *
 * Nothing is awaited after it: `assign` starts a navigation the browser finishes on its own, and the
 * page it lands on is a fresh document either way.
 */
export const useLogout = (): (() => Promise<void>) => {
	const client = useClient()

	return useCallback(async () => {
		try {
			await client.mutation(LogoutDocument, {}, CTX_LOGOUT).toPromise()
		} catch {
			// Deliberately ignored — see above. The session ends locally either way.
		}

		clearAccessToken()
		clearSession()
		window.location.assign('/')
	}, [client])
}
