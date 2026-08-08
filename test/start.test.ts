import { describe, expect, it } from 'vitest'

import { isServerFnRequest, startInstance } from '@/start'

/**
 * A fake request rather than a real `Request`: the CSRF check reads exactly two things off it — the
 * three headers and the URL's origin — and a hand-rolled pair says which header is absent far more
 * plainly than a `Request` built to be missing one.
 */
const ctxFor = (handlerType: 'serverFn' | 'router', headers: Record<string, string> = {}) => ({
	handlerType,
	request: {
		url: 'https://marketplace.test/_serverFn/whatever',
		headers: { get: (name: string) => headers[name] ?? null }
	},
	next: () => NEXT
})

const NEXT = Symbol('next')

type Ctx = ReturnType<typeof ctxFor>

/**
 * The middleware's server handler, reached through `options` because the filter is a closure and there
 * is nothing else to read it off. This is what the request pipeline calls, so driving it is what proves
 * the middleware was built with the filter rather than merely built.
 */
const runCsrf = async (ctx: Ctx) => {
	const middleware = (await startInstance.getOptions()).requestMiddleware?.[0]

	return (middleware as unknown as { options: { server: (ctx: Ctx) => Promise<unknown> } }).options.server(ctx)
}

/*
 * This file exists so the router generator has a start instance to type its `Register` against — see the
 * comment in `src/start.ts`. The tests below are about the one thing that declaring it changes at run
 * time: the framework stops supplying `defaultCsrfMiddleware` and uses what is written here instead, so
 * an options object that lost the middleware would leave same-origin RPC unguarded and nothing else in
 * this suite would notice.
 */
describe('start entry', () => {
	// The predicate on its own. It is the framework's default filter, reproduced: server functions are
	// RPC endpoints and are checked; a router request is an ordinary navigation and is not.
	it('selects server functions and lets router requests past', () => {
		expect(isServerFnRequest({ handlerType: 'serverFn' })).toBe(true)
		expect(isServerFnRequest({ handlerType: 'router' })).toBe(false)
	})

	it('declares exactly one request middleware', async () => {
		expect((await startInstance.getOptions()).requestMiddleware).toHaveLength(1)
	})

	/*
	 * The filter reaching the middleware, and not merely existing.
	 *
	 * This request carries no `Sec-Fetch-Site`, no `Origin` and no `Referer`, which is the shape the CSRF
	 * check refuses when it cannot establish an origin. It is waved through anyway because it is a router
	 * request and the filter returns before the check runs — so a middleware built without the filter
	 * answers 403 here, and that is the whole of the difference this assertion is watching for.
	 */
	it('does not run the origin check on a router request', async () => {
		expect(await runCsrf(ctxFor('router'))).toBe(NEXT)
	})

	// The other side of the same wiring: the filter admits a server function, and the check then does its
	// job on one whose Origin is not this site's.
	it('refuses a cross-origin server function call', async () => {
		const response = await runCsrf(ctxFor('serverFn', { Origin: 'https://attacker.test' }))

		expect(response).toBeInstanceOf(Response)
		expect((response as Response).status).toBe(403)
	})

	// And admits the same call made from this site, which is what keeps the guard from being a blanket
	// refusal that no test would tell apart from a working one.
	it('allows a same-origin server function call', async () => {
		expect(await runCsrf(ctxFor('serverFn', { Origin: 'https://marketplace.test' }))).toBe(NEXT)
	})
})
