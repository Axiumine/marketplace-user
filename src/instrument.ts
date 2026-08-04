import * as Sentry from '@sentry/react'

import { env } from '@/env'

/**
 * Imported first by the client entry, before React, so the SDK's instrumentation is installed before anything
 * it needs to wrap has run.
 *
 * No DSN means no init: a developer machine reports nothing, and CI never invents traffic against the
 * production project. Data collection stays off — this app handles customer credentials, and the one
 * thing that must never leave the browser is a request body carrying a password.
 *
 * `dataCollection` replaces `sendDefaultPii`, which the SDK deprecated and drops in v11.
 *
 * ⚠️ Every category is listed on purpose. The two options are not a rename: with `dataCollection`
 * absent the SDK resolves each category through the `sendDefaultPii` bridge, so `false` turned
 * everything off at once; with `dataCollection` *present* the base becomes the SDK's own permissive
 * DEFAULTS and every key left out is silently opted **in** — `userInfo`, `cookies`, `httpHeaders`,
 * `httpBodies` and `urlQueryParams` all default to on. A partial block here would leak more than the
 * single line it replaced. Add a category, do not remove one.
 *
 * Three categories are stricter than the bridge was, all deliberately. `cookies`, `httpHeaders` and
 * `urlQueryParams` used to be deny-lists built from an internal constant the SDK does not export, so
 * a faithful copy is not available to us; a hard `false` is the safe direction to miss in. `graphQL`
 * and `stackFrameVariables` were on and are now off: the first is inert without a GraphQL integration
 * (none is registered), and the second would put a login form's local variables — the password among
 * them — into a stack frame. `frameContextLines` keeps the bridge's 7 rather than the spec default
 * of 5; it is source text, not user data.
 */
if (env.sentryDsn !== '') {
	Sentry.init({
		dsn: env.sentryDsn,
		environment: env.sentryEnvironment,
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: { request: false, response: false },
			httpBodies: [],
			urlQueryParams: false,
			graphQL: { document: false, variables: false },
			genAI: { inputs: false, outputs: false },
			databaseQueryData: false,
			stackFrameVariables: false,
			frameContextLines: 7
		},
		tracesSampleRate: 0.1
	})
}
