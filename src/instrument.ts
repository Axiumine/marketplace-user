import { sentryBeforeSend } from '@axiumine/marketplace-common/others/sentryBeforeSend'
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
 *
 * ⚠️ **`urlQueryParams: false` does not hold here, and `beforeSend` is why the option list is not the
 * whole story.** Measured against a local collector with the real SDK and a real transport
 * (`docs/report/sentry-event-capture.md` §9): a page opened at `/reset-password/confirm?token=…#/…` shipped
 * that whole address — query string and fragment — on `event.request.url`, on
 * `contexts.trace.data['url.full']`, on the `description` of eight browser-metric spans and on both `from`
 * and `to` of the navigation breadcrumb, which then rides along on *every later event of the session*.
 * `urlQueryParams` gates `event.request.query_string`, a field the browser never fills in;
 * `httpContextIntegration` copies `location.href` unconditionally. `httpBodies: []` does hold — a captured
 * `fetch` breadcrumb carried method, URL and status code and no body.
 *
 * `sentryBeforeSend` is the answer to all of it, and is wired as **both** hooks because the SDK routes a
 * transaction to `beforeSendTransaction` only — and the transaction is where `url.full` and the eight span
 * descriptions live. One shared implementation in `@axiumine/marketplace-common` rather than three copies
 * here: the three apps have no shared frontend package of their own, this scrubber is the single statement
 * of what may never leave a browser, and three copies drift the moment one is fixed. The module imports
 * nothing and walks plain object bags, so the subpath export pulls exactly one file into the bundle.
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
		beforeSend: sentryBeforeSend,
		beforeSendTransaction: sentryBeforeSend,
		tracesSampleRate: 0.1
	})
}
