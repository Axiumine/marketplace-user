import { graphql } from '@gql/logout'

/**
 * Ends the session on the server: deletes both Redis keys and clears the refresh cookie.
 *
 * One mutation for all three tiers, and there is no `logoutUser`. `authorizationLogoutHandler` resolves
 * the bearer token straight out of Redis and deletes it by content — it never opens a collection and
 * never asks which model minted the session, so it is tier-agnostic by construction. A tier-named
 * mutation would only be needed if each tier had its own `REDIS_KEY` prefix, and they deliberately
 * share one.
 *
 * ⚠️ The local teardown must not wait on this answer. A failed logout still has to clear the in-memory
 * token and drop the visitor to the public site: leaving them "signed in" against a session the server
 * may already have dropped is worse than a stale key that expires on its own.
 */
export const LogoutDocument = graphql(`
	mutation Logout {
		logout
	}
`)
