import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useMutation } from 'urql'
import { describe, expect, it } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { HTTP } from '@/api/errors'
import { UserPersonalDataUpdateDocument } from '@/api/operations/userResource/mutations'
import { AccountGate, useMe } from '@/features/account/AccountGate'
import { CTX_ACCOUNT_WRITE } from '@/features/account/invalidate'

import type { GraphQLReplies } from '../../helpers/graphql'
import { graphQLError, stubGraphQL } from '../../helpers/graphql'
import { FULL_ME, meReply } from '../../helpers/me'
import { CUSTOMER_EMAIL, renderWithRouter } from '../../helpers/render'

/** Reads the account out of context — the whole point of the gate is that this cannot be undefined. */
const Inside = () => {
	const me = useMe()

	return <p>Signed in as {me.email}</p>
}

const mount = async (replies: GraphQLReplies = meReply()) => {
	const stub = stubGraphQL(replies)
	const result = await renderWithRouter(
		<AccountGate>
			<Inside />
		</AccountGate>,
		{ token: 'access-token', session: CUSTOMER_EMAIL, path: '/account' }
	)

	return { ...result, stub }
}

/**
 * Stands in for any screen below the gate that writes: `CTX_ACCOUNT_WRITE` names `GraphQLUserMe` in
 * `additionalTypenames`, so a mutation sent with it invalidates the account query and urql runs it again.
 * That is the real mechanism — not a hand-rolled refetch — and it is what puts the gate in the state the
 * rest of this file never reaches: an account already in hand, and a second `Me` in flight under it.
 */
const WithSave = () => {
	const me = useMe()
	const [, save] = useMutation(UserPersonalDataUpdateDocument)

	return (
		<>
			<p>Signed in as {me.email}</p>

			<button
				type="button"
				onClick={() => {
					void save({ personalData: { firstName: 'Julia', lastName: 'Rivers' } }, CTX_ACCOUNT_WRITE)
				}}
			>
				Save
			</button>
		</>
	)
}

/** A terminal status: no refresh recovers it. */
const gone = (status: number): GraphQLReplies => ({ Me: { errors: [graphQLError('Token required')], status } })

describe('AccountGate loading', () => {
	it('says it is loading before the account arrives', async () => {
		await mount({ Me: { pending: true } })

		expect(await screen.findByRole('status')).toHaveTextContent('Loading your account…')
	})

	it('renders the screen once it has', async () => {
		await mount()

		expect(await screen.findByText(`Signed in as ${CUSTOMER_EMAIL}`)).toBeInTheDocument()
	})

	/*
	 * ⚠️ Every write in the private area invalidates the account query, so a second `Me` while the account
	 * is on screen is the *normal* state after saving a form — not an edge case. A gate that asked "is a
	 * request in flight?" before "do I have an account?" would blank the whole area and replace it with
	 * "Loading your account…" on every save, discarding the scroll position and moving focus off the button
	 * the customer just used.
	 *
	 * The reply to that second query never arrives here, which is the point: the gate is left holding an
	 * account it already had, with a request outstanding under it, for as long as the assertions take.
	 */
	it('keeps the account on screen while it revalidates', async () => {
		const user = userEvent.setup()
		/*
		 * ⚠️ `__typename` is spelled out here and nowhere else in the fixtures, because this is the only test
		 * that depends on the document cache doing its job. urql registers a cached query under the typenames
		 * it finds in the *response*, and `CTX_ACCOUNT_WRITE` invalidates by naming one of them — so a reply
		 * without it is filed under nothing, the mutation invalidates nothing, and the account query never
		 * runs a second time. In the app the server sends it: urql adds the field to every selection set on
		 * its way out.
		 */
		const stub = stubGraphQL({
			Me: [{ data: { me: { ...FULL_ME, __typename: 'GraphQLUserMe' } } }, { pending: true }],
			UserPersonalDataUpdate: { data: { userPersonalDataUpdate: true } }
		})
		await renderWithRouter(
			<AccountGate>
				<WithSave />
			</AccountGate>,
			{ token: 'access-token', session: CUSTOMER_EMAIL, path: '/account' }
		)

		await screen.findByText(`Signed in as ${CUSTOMER_EMAIL}`)
		await user.click(screen.getByRole('button', { name: 'Save' }))

		await waitFor(() => {
			expect(stub.calls.filter((call) => call.operationName === 'Me')).toHaveLength(2)
		})
		expect(screen.queryByRole('status')).not.toBeInTheDocument()
		expect(screen.getByText(`Signed in as ${CUSTOMER_EMAIL}`)).toBeInTheDocument()
	})

	it('asks the user resource service for it', async () => {
		const { stub } = await mount()

		await screen.findByText(`Signed in as ${CUSTOMER_EMAIL}`)
		expect(stub.calls.find((call) => call.operationName === 'Me')?.url).toBe(ENDPOINT.userResource)
	})

	/*
	 * ⚠️ The query is fired once, here, and shared through context. urql's document cache would dedupe a
	 * second `useQuery(MeDocument)` anyway, so the duplication would be invisible in the network tab — the
	 * reason to centralise it is the *type*. A screen with its own query handles `data === undefined` on
	 * every render, so every field access grows an optional chain and a branch that cannot be reached once
	 * the layout has rendered.
	 */
	it('throws when a screen reads the account without it', () => {
		// The honest failure: the screen was reached without the layout above it, which is a routing mistake
		// and not a state a message can help with. Returning null would push the same crash one field access
		// further down, where the cause is no longer visible.
		expect(() => render(<Inside />)).toThrow('useMe was called outside AccountGate')
	})
})

describe('AccountGate session authority', () => {
	/*
	 * ⚠️ "Signed in" is **not** decided by `src/auth/session.ts`, and must not be. That store is empty
	 * after every reload — it is module state — while the httpOnly refresh cookie usually is not.
	 * Redirecting on `!signedIn` would bounce every customer who reloaded the account page straight to a
	 * login form they did not need.
	 */
	it('renders the account for a reloaded tab with no session in module state', async () => {
		stubGraphQL(meReply())
		await renderWithRouter(
			<AccountGate>
				<Inside />
			</AccountGate>,
			{ path: '/account' }
		)

		expect(await screen.findByText(`Signed in as ${CUSTOMER_EMAIL}`)).toBeInTheDocument()
	})

	/*
	 * A 498 is not terminal: the auth exchange refreshes and retries, and the customer never learns it
	 * happened. Only 401 / 412 / 499 mean the session is really over.
	 */
	it('recovers from an expired access token rather than redirecting', async () => {
		const { router } = await mount({
			Me: [{ errors: [graphQLError('Invalid token')], status: HTTP.invalidToken }, meReply().Me as never],
			Refresh: { data: { refresh: { status: true, accessToken: 'fresh-token' } } }
		})

		expect(await screen.findByText(`Signed in as ${CUSTOMER_EMAIL}`)).toBeInTheDocument()
		expect(router.state.location.pathname).toBe('/account')
	})
})

describe('AccountGate on a dead session', () => {
	it.each([
		['unauthorized', HTTP.unauthorized],
		['precondition failed', HTTP.preconditionFailed],
		['token required', HTTP.tokenRequired]
	])('sends the customer to the login form on %s', async (_label, status) => {
		const { router } = await mount(gone(status))

		await waitFor(() => {
			expect(router.state.location.pathname).toBe('/login')
		})
	})

	/*
	 * ⚠️ `replace`, so the back button does not walk into the page we were just thrown out of — which would
	 * fire the same query, fail the same way and bounce back here. A loop the customer cannot escape.
	 */
	it('replaces the history entry rather than pushing one', async () => {
		const before = window.history.length
		const { router } = await mount(gone(HTTP.unauthorized))

		await waitFor(() => {
			expect(router.state.location.pathname).toBe('/login')
		})
		expect(window.history.length).toBe(before)
	})

	// The redirect is already queued; an error about an expired session would flash for one frame and say
	// nothing the login page will not.
	it('renders nothing on the way out', async () => {
		const { container } = await mount(gone(HTTP.unauthorized))

		await waitFor(() => {
			expect(container).toBeEmptyDOMElement()
		})
	})
})

describe('AccountGate on a failure that is not the session', () => {
	// A 500 is not a reason to sign anybody out. The message goes on screen and the customer can retry.
	it('shows the message and stays put', async () => {
		const { router } = await mount({
			Me: { errors: [graphQLError('Database unavailable')], status: HTTP.internal }
		})

		expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable')
		expect(router.state.location.pathname).toBe('/account')
	})

	it('renders no account screen behind the error', async () => {
		await mount({ Me: { errors: [graphQLError('Database unavailable')], status: HTTP.internal } })

		await screen.findByRole('alert')
		expect(screen.queryByText(`Signed in as ${CUSTOMER_EMAIL}`)).not.toBeInTheDocument()
	})

	// A body that is not a GraphQL envelope at all — a proxy error page, say. There is no error to quote,
	// so the generic line is what the customer gets.
	it('handles an answer with no data and no error', async () => {
		await mount({ Me: { body: '{}' } })

		expect(await screen.findByRole('alert')).toHaveTextContent('Error while communicating with the server')
	})
})

describe('useMe', () => {
	it('hands the loaded account to the screen below', async () => {
		await mount()

		expect(await screen.findByText(`Signed in as ${FULL_ME.email}`)).toBeInTheDocument()
	})
})
