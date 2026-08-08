import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

/**
 * The Start entry. It exists to be **declared**, not to be configured.
 *
 * Without this file the router generator writes `import type { createStart } from
 * '@tanstack/react-start'` into `src/routeTree.gen.ts` and then has nothing to use it for. That is not a
 * generator bug: the framework's own fallback entry is `export const startInstance = undefined`
 * (`@tanstack/react-start/src/default-entry/start.ts`), so with no start file there is no instance for
 * the generated `Register` interface to hang a `config` member on, and the import it emitted goes
 * nowhere. The file is generated, prettier-ignored and excluded from eslint and coverage, so Qodana is
 * the one gate still reading it — it reports the dead import as a HIGH `ES6UnusedImports` and the
 * pre-commit hook refuses the commit. Declaring the entry moves the generator onto its other branch:
 * `import type { startInstance } from './start'`, used by `config: Awaited<ReturnType<typeof
 * startInstance.getOptions>>`.
 *
 * ⚠️ **The CSRF middleware below is load-bearing, and an empty options object here would remove it.**
 * `createStartHandler` injects its own `defaultCsrfMiddleware` *only while no start instance exists*:
 *
 *     requestMiddleware: hasStartInstance ? startOptions.requestMiddleware : [defaultCsrfMiddleware]
 *
 * The moment this file exists, `hasStartInstance` is true and the request chain is whatever
 * `requestMiddleware` says — so `createStart(() => ({}))` would mean *no request middleware at all* and
 * would trade a lint warning for unprotected same-origin RPC. What is below reproduces the framework's
 * default exactly, same `createCsrfMiddleware` and same filter, so the protection is unchanged and only
 * now written down. It is also the snippet the framework itself prints when it detects the gap.
 *
 * Nothing here calls `createServerFn` yet, so the filter matches no request today. That is the reason to
 * keep it rather than to drop it: the first server function added to this app is protected on arrival,
 * without anyone having to remember this file exists.
 */

/**
 * Exported to be tested. The filter runs inside the middleware's server handler, which a unit test can
 * only reach through framework internals; as a named function it is checked directly, and the coverage
 * and mutation gates read the same predicate the middleware runs.
 */
export const isServerFnRequest = (ctx: { handlerType: 'serverFn' | 'router' }) => ctx.handlerType === 'serverFn'

const csrfMiddleware = createCsrfMiddleware({ filter: isServerFnRequest })

export const startInstance = createStart(() => ({
	requestMiddleware: [csrfMiddleware]
}))
