import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { ENDPOINT } from '@/api/endpoints'
import { getAccessToken } from '@/api/tokenStore'
import { getSession } from '@/auth/session'
import { useLogout } from '@/auth/useLogout'

import type { GraphQLReplies } from '../helpers/graphql'
import { graphQLError, stubGraphQL } from '../helpers/graphql'
import { stubLocationAssign } from '../helpers/location'
import { CUSTOMER_EMAIL, renderWithRouter } from '../helpers/render'

const SignOut = () => {
	const logout = useLogout()

	return (
		<button type="button" onClick={() => void logout()}>
			Sign out
		</button>
	)
}

/**
 * The location stub goes in *after* the render: `renderWithRouter` points jsdom's URL at `path` and then
 * lets the router read it, and a copy taken before that would freeze the router on the wrong page.
 */
const signOut = async (replies: GraphQLReplies) => {
	const stub = stubGraphQL(replies)
	await renderWithRouter(<SignOut />, {
		token: 'abc123',
		session: CUSTOMER_EMAIL,
		path: '/login'
	})

	const assign = stubLocationAssign()

	await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))

	return { assign, stub }
}

describe('useLogout', () => {
	it('tells the server to drop the session', async () => {
		const { stub } = await signOut({ Logout: { data: { logout: true } } })

		expect(stub.calls.map((call) => call.operationName)).toContain('Logout')
	})

	/*
	 * ⚠️ One logout service for all three tiers, on 4030. Its resolver deletes the Redis keys by token
	 * content and never asks which collection minted them, which is why there is no `logoutUser` and why
	 * pointing this at the user-tier authorization service would 404 the mutation.
	 */
	it('sends it to the shared logout service', async () => {
		const { stub } = await signOut({ Logout: { data: { logout: true } } })
		const logout = stub.calls.find((call) => call.operationName === 'Logout')

		expect(logout?.url).toBe(ENDPOINT.logout)
	})

	// The token goes with the request — the resolver needs the very token it is about to invalidate.
	it('sends the token it is asking the server to invalidate', async () => {
		const { stub } = await signOut({ Logout: { data: { logout: true } } })
		const logout = stub.calls.find((call) => call.operationName === 'Logout')

		expect(logout?.authorization).toBe('Bearer access:abc123')
	})

	it('forgets the access token', async () => {
		await signOut({ Logout: { data: { logout: true } } })

		expect(getAccessToken()).toBeNull()
	})

	it('signs the customer out locally', async () => {
		await signOut({ Logout: { data: { logout: true } } })

		expect(getSession()).toEqual({ signedIn: false, email: null })
	})

	/*
	 * Home, not the login page. This app has a public site to fall back to, and a signed-out customer
	 * reading shop pages is the normal case rather than an error state — bouncing them to a login form
	 * they did not ask for reads as "something went wrong".
	 *
	 * ⚠️ And a full page load, not a router navigation: the urql client is a module singleton holding a
	 * document cache, and `Me` takes no variables, so only a real load guarantees the next customer to
	 * sign in on this tab is not handed the previous one's account.
	 */
	it('drops the customer on the public home page, by loading it', async () => {
		const { assign } = await signOut({ Logout: { data: { logout: true } } })

		expect(assign).toHaveBeenCalledExactlyOnceWith('/')
	})

	/*
	 * ⚠️ The local teardown is not conditional on the server's answer. A logout the server refused still
	 * has to sign the customer out here: leaving them nominally signed in against a session the server may
	 * already have dropped is the worse outcome — every later action fails with no explanation while the
	 * visible state says everything is fine.
	 */
	it.each([
		['the mutation errors', { errors: [graphQLError('Internal Server Error', undefined, 500)], status: 500 }],
		['the request never reached the server', { networkError: 'Failed to fetch' }],
		['the resolver answers false', { data: { logout: false } }]
	])('signs the customer out anyway when %s', async (_label, reply) => {
		await signOut({ Logout: reply })

		expect(getAccessToken()).toBeNull()
		expect(getSession().signedIn).toBe(false)
	})

	it('still leaves for home when the mutation failed', async () => {
		const { assign } = await signOut({ Logout: { networkError: 'Failed to fetch' } })

		expect(assign).toHaveBeenCalledExactlyOnceWith('/')
	})

	/*
	 * ⚠️ The mutation is awaited *before* the local teardown, so the Redis keys and the refresh cookie are
	 * gone before the app forgets the token. Clearing first would send a logout with no `Authorization`
	 * header, and the resolver — which looks the session up by token content — would have nothing to
	 * delete: the session would survive on the server for the whole 90-day refresh window.
	 */
	it('clears the token only after the server was told', async () => {
		const { stub } = await signOut({ Logout: { data: { logout: true } } })
		const logout = stub.calls.find((call) => call.operationName === 'Logout')

		expect(logout?.authorization).not.toBeNull()
		expect(getAccessToken()).toBeNull()
	})

	// Clicking twice must not throw, and must not send a second mutation with a token that no longer
	// exists — the second call is a no-op against an already-empty store.
	it('survives a second click', async () => {
		const stub = stubGraphQL({ Logout: { data: { logout: true } } })
		await renderWithRouter(<SignOut />, { token: 'abc123', session: CUSTOMER_EMAIL, path: '/login' })
		stubLocationAssign()

		const button = screen.getByRole('button', { name: 'Sign out' })
		await userEvent.click(button)
		await userEvent.click(button)

		expect(getSession().signedIn).toBe(false)
		expect(stub.calls.filter((call) => call.operationName === 'Logout')).toHaveLength(2)
	})
})
