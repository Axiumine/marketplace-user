import type { OperationContext } from '@urql/core'

import { ENDPOINT } from '@/api/endpoints'

/**
 * The context every private-area **write** must be sent with.
 *
 * ⚠️ **Omitting `additionalTypenames` here is a silent bug, not a missing optimisation.** urql's document
 * cache invalidates a cached query when a mutation's *response* mentions one of the `__typename`s that
 * query returned. Every mutation on this tier answers `Boolean` or `OnlyIdType` — neither of which
 * mentions `GraphQLUserMe` — so the cache concludes that nothing the account query returned has changed.
 * The mutation succeeds, the server has the new value, and the screen keeps rendering the old one until
 * a full reload. This is the single most repeated bug in the two sibling apps.
 *
 * Naming the type here makes the round trip explicit: the write says what it touched, and `AccountGate`'s
 * `me` query re-runs by itself.
 *
 * It is a frozen module constant for the same reason the `CTX_*` objects are. Mutations are not
 * re-executed on a context change the way queries are, so a literal would be harmless *today* — but the
 * two kinds of context are read by the same code, and one house rule is cheaper to keep than an
 * exception to remember.
 */
export const CTX_ACCOUNT_WRITE: Partial<OperationContext> = Object.freeze({
	url: ENDPOINT.userResource,
	additionalTypenames: ['GraphQLUserMe']
})
