import { describe, expect, it } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { CTX_ACCOUNT_WRITE } from '@/features/account/invalidate'

describe('CTX_ACCOUNT_WRITE', () => {
	it('points at the user resource service', () => {
		expect(CTX_ACCOUNT_WRITE.url).toBe(ENDPOINT.userResource)
	})

	/*
	 * ⚠️ Omitting this is a silent bug, not a missing optimisation. urql's document cache invalidates a
	 * cached query when a mutation's *response* mentions a `__typename` that query returned — and every
	 * mutation on this tier answers `Boolean` or `OnlyIdType`, neither of which mentions `GraphQLUserMe`.
	 * The cache concludes nothing changed: the write succeeds, the server holds the new value, and the
	 * screen keeps rendering the old one until a full reload.
	 */
	it('names the type the account query returns, so a write re-runs it', () => {
		expect(CTX_ACCOUNT_WRITE.additionalTypenames).toEqual(['GraphQLUserMe'])
	})

	/*
	 * Frozen and module-scoped, like the `CTX_*` endpoints. Mutations are not re-executed on a context
	 * change the way queries are, so a literal would be harmless *today* — but both kinds of context are
	 * read by the same code, and one house rule is cheaper to keep than an exception to remember.
	 */
	it('is a frozen module constant rather than a literal per call site', () => {
		expect(Object.isFrozen(CTX_ACCOUNT_WRITE)).toBe(true)
	})

	it('carries nothing else', () => {
		expect(Object.keys(CTX_ACCOUNT_WRITE).sort()).toEqual(['additionalTypenames', 'url'])
	})
})
