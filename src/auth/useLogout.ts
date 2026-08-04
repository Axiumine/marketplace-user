import { useNavigate } from '@tanstack/react-router'
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
 */
export const useLogout = (): (() => Promise<void>) => {
	const client = useClient()
	const navigate = useNavigate()

	return useCallback(async () => {
		try {
			await client.mutation(LogoutDocument, {}, CTX_LOGOUT).toPromise()
		} catch {
			// Deliberately ignored — see above. The session ends locally either way.
		}

		clearAccessToken()
		clearSession()
		await navigate({ to: '/' })
	}, [client, navigate])
}
