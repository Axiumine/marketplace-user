import type { OperationContext } from '@urql/core'

import { env } from '@/env'

/**
 * The five GraphQL endpoints, and the urql contexts that route a document to one of them.
 *
 * urql has a single `Client` with a single default `url`; anything else is selected per operation
 * through `context.url`. The default is the **public** resource endpoint, not the authenticated one —
 * the opposite of the other two apps, and for a reason that is the whole shape of this app: most of
 * what it renders is anonymous catalogue, and the private area is the exception.
 *
 * The context objects are module-level constants on purpose. urql re-executes an operation when its
 * context changes, and it compares by key: a `{ url }` literal built inside a component body is a new
 * object on every render, which turns a static query into an infinite refetch loop.
 */
export const ENDPOINT = {
	publicResource: env.publicResource,
	publicAuthorization: env.publicAuthorization,
	userAuthorization: env.userAuthorization,
	userResource: env.userResource,
	logout: env.logout
} as const

export const CTX_PUBLIC_RESOURCE: Partial<OperationContext> = Object.freeze({ url: ENDPOINT.publicResource })
export const CTX_PUBLIC_AUTHORIZATION: Partial<OperationContext> = Object.freeze({ url: ENDPOINT.publicAuthorization })
export const CTX_USER_AUTHORIZATION: Partial<OperationContext> = Object.freeze({ url: ENDPOINT.userAuthorization })
export const CTX_USER_RESOURCE: Partial<OperationContext> = Object.freeze({ url: ENDPOINT.userResource })
export const CTX_LOGOUT: Partial<OperationContext> = Object.freeze({ url: ENDPOINT.logout })

/**
 * Endpoints reachable without an access token.
 *
 * `publicAuthorization` hosts `loginUser`, and requiring a token to log in would be a deadlock.
 * `publicResource` hosts the entire catalogue plus registration and password reset, and has no auth
 * middleware at all — that absence is what lets the SSR loaders render shop pages for a crawler.
 *
 * Getting this list wrong is not cosmetic. `willAuthError` in src/api/client.ts uses it to decide
 * whether to run a refresh *before* sending, so listing an anonymous endpoint as authenticated would
 * make every anonymous visitor's first page view fire a refresh that cannot succeed — and then land on
 * `onSessionLost`, bouncing a browsing visitor to the login page.
 */
// The element type is widened to include `undefined` so the lookup below needs no `?? ''` default.
// urql answers `context.url` as `string | undefined`, no endpoint is ever the empty string, and a
// default whose value cannot change the answer is a token no test can pin down.
const ANONYMOUS: readonly (string | undefined)[] = [ENDPOINT.publicResource, ENDPOINT.publicAuthorization]

/** Whether an operation needs an access token before it is worth sending. */
export const requiresAuth = (url: string | undefined): boolean => !ANONYMOUS.includes(url)
