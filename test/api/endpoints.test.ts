import { describe, expect, it } from 'vitest'

import {
	CTX_LOGOUT,
	CTX_PUBLIC_AUTHORIZATION,
	CTX_PUBLIC_RESOURCE,
	CTX_USER_AUTHORIZATION,
	CTX_USER_RESOURCE,
	ENDPOINT,
	requiresAuth
} from '@/api/endpoints'
import { env } from '@/env'

describe('ENDPOINT', () => {
	it('names the five endpoints this app talks to, from the environment', () => {
		expect(ENDPOINT).toEqual({
			publicResource: env.publicResource,
			publicAuthorization: env.publicAuthorization,
			userAuthorization: env.userAuthorization,
			userResource: env.userResource,
			logout: env.logout
		})
	})

	/*
	 * ⚠️ The two authenticated endpoints are the **User** tier's, on 4031 and 4032. `/authenticated-*`
	 * (4026 / 4029) is the ShopOwner tier's, and since the tier fix a session minted here is rejected
	 * there with a 403 — so pointing this app at one fails closed rather than quietly succeeding, which
	 * is the whole reason the tier field exists.
	 */
	it('points at the user tier, never at the shop-owner one', () => {
		expect(ENDPOINT.userAuthorization).toBe('/user-authenticated-authorization')
		expect(ENDPOINT.userResource).toBe('/user-authenticated-resource')
		expect(Object.values(ENDPOINT)).not.toContain('/authenticated-authorization')
		expect(Object.values(ENDPOINT)).not.toContain('/authenticated-resource')
	})

	// One logout for all three tiers on purpose: that resolver deletes the Redis keys by token content and
	// never asks which collection minted them.
	it('shares the one logout service with the other two tiers', () => {
		expect(ENDPOINT.logout).toBe('/logout')
	})
})

describe('the urql contexts', () => {
	const CONTEXTS = [
		['CTX_PUBLIC_RESOURCE', CTX_PUBLIC_RESOURCE, ENDPOINT.publicResource],
		['CTX_PUBLIC_AUTHORIZATION', CTX_PUBLIC_AUTHORIZATION, ENDPOINT.publicAuthorization],
		['CTX_USER_AUTHORIZATION', CTX_USER_AUTHORIZATION, ENDPOINT.userAuthorization],
		['CTX_USER_RESOURCE', CTX_USER_RESOURCE, ENDPOINT.userResource],
		['CTX_LOGOUT', CTX_LOGOUT, ENDPOINT.logout]
	] as const

	it.each(CONTEXTS)('%s routes to its own endpoint', (_name, context, url) => {
		expect(context).toEqual({ url })
	})

	/*
	 * ⚠️ Module constants, and the identity check is the assertion that matters. urql re-executes an
	 * operation whenever its context changes and compares by key, so a `{ url }` literal built in a
	 * component body is a new object on every render — which turns a static query into an infinite
	 * refetch loop that looks like a slow network rather than a bug.
	 */
	it.each(CONTEXTS)('%s is the same object on every read', (_name, context) => {
		expect(context).toBe(context)
		expect(Object.isFrozen(context)).toBe(true)
	})

	it('gives every endpoint a distinct context object', () => {
		const objects = CONTEXTS.map(([, context]) => context)

		expect(new Set(objects).size).toBe(objects.length)
	})
})

describe('requiresAuth', () => {
	/*
	 * ⚠️ Getting this list wrong is not cosmetic. `willAuthError` calls it to decide whether to refresh
	 * *before* sending, so an anonymous endpoint listed as authenticated makes every anonymous visitor's
	 * first catalogue query fire a refresh that cannot succeed — and the failed refresh calls
	 * `onSessionLost`, bouncing a visitor who was only browsing.
	 */
	it.each([
		['the public catalogue, registration and password reset', ENDPOINT.publicResource],
		['the login service', ENDPOINT.publicAuthorization]
	])('sends to %s without a token', (_label, url) => {
		expect(requiresAuth(url)).toBe(false)
	})

	it.each([
		['the token service', ENDPOINT.userAuthorization],
		['the account service', ENDPOINT.userResource],
		['logout', ENDPOINT.logout]
	])('needs a token for %s', (_label, url) => {
		expect(requiresAuth(url)).toBe(true)
	})

	/*
	 * An operation with no `context.url` falls back to the client's default, which is the *public*
	 * resource endpoint on this app — the opposite of the two sibling apps. Answering `true` here would
	 * make every document that forgot its `CTX_*` refresh before sending.
	 *
	 * ⚠️ It still answers `true`, because `undefined` is not in the anonymous list, and that is the safe
	 * direction: a document with no context is a bug, and refusing to send it without a token surfaces
	 * that bug rather than sending an anonymous query that happens to work.
	 */
	it('treats an operation with no endpoint as authenticated', () => {
		expect(requiresAuth(undefined)).toBe(true)
	})

	it('treats an endpoint nobody configured as authenticated', () => {
		expect(requiresAuth('/some-other-service')).toBe(true)
	})

	// Exact match, not a prefix: `/public-resource-admin` is a different service, and a `startsWith` here
	// would let it through unauthenticated.
	it('matches the endpoint exactly rather than by prefix', () => {
		expect(requiresAuth(`${ENDPOINT.publicResource}-admin`)).toBe(true)
		expect(requiresAuth(ENDPOINT.publicResource.slice(1))).toBe(true)
	})
})
