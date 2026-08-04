import type { DocumentType } from '@gql/userResource'
import { useNavigate } from '@tanstack/react-router'
import { createContext, type ReactNode, use, useEffect } from 'react'
import { useQuery } from 'urql'

import { CTX_USER_RESOURCE } from '@/api/endpoints'
import { isSessionGone, messageOf } from '@/api/errors'
import { MeDocument } from '@/api/operations/userResource/queries'
import { FormStatus } from '@/components/ui/FormStatus'

/**
 * The private area's single source of the account, and its only guard.
 *
 * ⚠️ **The `me` query is fired once, here, and shared through context — every screen below reads it
 * rather than asking again.** urql's document cache would dedupe a second `useQuery(MeDocument)` into
 * the same result, so the duplication would be invisible in the network tab and correct at runtime; the
 * reason to centralise it anyway is the *type*. A screen that runs its own query has to handle
 * `data === undefined` on every render, so every field access grows an optional chain and a "loading"
 * branch that can never be reached once the layout has rendered. Reading a non-nullable value out of
 * context deletes all of that.
 *
 * ⚠️ **"Signed in" is not decided by `src/auth/session.ts` here, and must not be.** That store is empty
 * after every reload — it is module state, and a reload rebuilds the module — while the httpOnly refresh
 * cookie usually is not. Redirecting on `!signedIn` would bounce every customer who reloaded the account
 * page straight to a login form they did not need. The authority is the server: the query goes out, the
 * auth exchange silently refreshes when there is no access token to send, and only a *terminal* status
 * (401 / 412 / 499, `isSessionGone`) means the session is really over.
 *
 * The redirect therefore lives in an effect keyed on that condition rather than in `beforeLoad`. A
 * loader cannot make this decision: it would have to run before the refresh had a chance, and on a route
 * that is `ssr: false` it runs in the browser anyway, so it buys nothing a render cannot do.
 */
type MeQuery = DocumentType<typeof MeDocument>

export type Me = MeQuery['me']
export type MeAddress = Me['addresses'][number]

const MeContext = createContext<Me | null>(null)

/**
 * The account, guaranteed loaded.
 *
 * Throws rather than returning null when called outside the gate. That is the honest failure: a screen
 * reached this code path without the layout above it, which is a routing mistake and not a state a
 * message can help with — and returning null would push the same crash one field access further down,
 * where the cause is no longer visible.
 */
export const useMe = (): Me => {
	const me = use(MeContext)
	if (me === null) throw new Error('useMe was called outside AccountGate')

	return me
}

const Centered = ({ children }: { readonly children: ReactNode }) => (
	<div className="mx-auto max-w-3xl px-4 py-10">{children}</div>
)

export const AccountGate = ({ children }: { readonly children: ReactNode }) => {
	const navigate = useNavigate()
	const [result] = useQuery({ query: MeDocument, context: CTX_USER_RESOURCE })
	const gone = isSessionGone(result.error)

	useEffect(() => {
		if (!gone) return

		// `replace` so the back button does not walk into the page we were just thrown out of, which would
		// fire the same query, fail the same way and bounce back here — a loop the customer cannot escape.
		void navigate({ to: '/login', replace: true })
	}, [gone, navigate])

	// `result.data` survives a refetch, so this only shows on the very first load — a background
	// revalidation after a mutation keeps rendering the account instead of blanking it.
	if (result.data === undefined && result.fetching) {
		return (
			<Centered>
				<p className="text-sm text-slate-600" role="status">
					Loading your account…
				</p>
			</Centered>
		)
	}

	// The redirect is already queued; rendering an error about an expired session would flash for one
	// frame and say nothing the login page will not.
	if (gone) return null

	if (result.data === undefined) {
		return (
			<Centered>
				<FormStatus tone="error" message={messageOf(result.error)} />
			</Centered>
		)
	}

	return <MeContext value={result.data.me}>{children}</MeContext>
}
