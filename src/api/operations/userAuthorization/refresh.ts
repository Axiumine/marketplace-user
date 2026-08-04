import { graphql } from '@gql/userAuthorization'

/**
 * Trades the refresh-token cookie for a new access token, rotating the cookie server-side.
 *
 * ⚠️ `RefreshType` has exactly two fields, and `refreshToken` is not one of them. The refresh token is
 * set as a signed httpOnly cookie and is never a payload value, so selecting it here would come back as
 * a validation error rather than as the token. Do not add it.
 *
 * Sent by the auth exchange, not by a component: on a page reload the in-memory access token is gone,
 * `willAuthError` fires before the first authenticated operation, and this is what runs.
 *
 * It goes to `/user-authenticated-authorization` (port 4031), the User tier's token service. The other
 * two tiers' services are identical in shape and would each refuse this cookie — since the Phase 0 tier
 * discriminator, with a 403 rather than with a confusing success.
 *
 * ⚠️ This must never run during server rendering. It reads the visitor's cookie and writes the result
 * into a module-scoped variable that a server process shares between concurrent requests. The private
 * routes are `ssr: false` for exactly this reason, and the SSR client in src/api/ssr.ts has no auth
 * exchange at all.
 */
export const RefreshDocument = graphql(`
	mutation Refresh {
		refresh {
			status
			accessToken
		}
	}
`)
