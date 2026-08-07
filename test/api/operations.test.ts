import type { DocumentNode } from 'graphql'
import { describe, expect, it } from 'vitest'

import * as logout from '@/api/operations/logout/logout'
import * as loginUser from '@/api/operations/publicAuthorization/loginUser'
import * as publicMutations from '@/api/operations/publicResource/mutations'
import * as publicQueries from '@/api/operations/publicResource/queries'
import * as refresh from '@/api/operations/userAuthorization/refresh'
import * as userMutations from '@/api/operations/userResource/mutations'
import * as userQueries from '@/api/operations/userResource/queries'

/*
 * ⚠️ `graphql()` from the client preset is a **lookup**, not a parser. It matches the template string
 * against the map codegen wrote into each `src/gql/<project>/gql.ts` and returns the document it finds
 * there — and when it finds nothing it returns `undefined`, without a warning and without failing the
 * build, because the string is typed by an overload that is satisfied by any literal codegen has seen
 * before. Edit an operation and forget `yarn codegen` and the export is `undefined` from that moment,
 * which surfaces as a urql error about a document that has no `kind`, in whichever screen happens to use
 * it first.
 *
 * That makes "every exported document resolved" a real contract worth asserting, and one no other test
 * covers for an operation the app does not currently call — `UserVerifyEmailResendDocument` has no screen
 * behind it yet, so it is the one export whose codegen entry nothing else would notice going stale.
 */
const MODULES: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
	['logout', logout],
	['publicAuthorization', loginUser],
	['publicResource/mutations', publicMutations],
	['publicResource/queries', publicQueries],
	['userAuthorization', refresh],
	['userResource/mutations', userMutations],
	['userResource/queries', userQueries]
]

const isDocument = (value: unknown): value is DocumentNode =>
	typeof value === 'object' && value !== null && (value as DocumentNode).kind === 'Document'

/** Every export of those modules is a document; the name is the operation name plus `Document`. */
const entries = MODULES.flatMap(([module, exports]) =>
	Object.entries(exports).map(([name, value]) => ({ id: `${module} · ${name}`, name, value }))
)

describe('the GraphQL operations', () => {
	it('exports at least one document per module', () => {
		expect(MODULES.every(([, exports]) => Object.keys(exports).length > 0)).toBe(true)
	})

	it.each(entries)('resolves $id to a parsed document', ({ value }) => {
		expect(isDocument(value)).toBe(true)
	})

	/*
	 * The operation name is what the stub in `helpers/graphql.ts` keys replies on, what a server log shows
	 * and what a persisted-query allowlist would hash — so a document whose name drifted from its export
	 * name is a rename that silently misses every one of those.
	 */
	it.each(entries)('names the operation in $id after the export', ({ name, value }) => {
		expect(isDocument(value)).toBe(true)

		const [definition] = (value as DocumentNode).definitions

		expect(definition?.kind).toBe('OperationDefinition')
		expect(definition?.kind === 'OperationDefinition' ? definition.name?.value : undefined).toBe(name.replace(/Document$/, ''))
	})
})
