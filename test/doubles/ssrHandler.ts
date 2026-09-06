/**
 * Stands in for `dist/server/server.js`, the SSR handler `vite build` emits and `serve.mjs` imports.
 *
 * ⚠️ **That file is a build artifact and is not in git**, so a test run that has not built cannot
 * resolve it — `yarn test` does not build, deliberately, because a full `vite build` for a
 * forty-seven-line adapter is minutes spent proving something the adapter does not depend on. What
 * `serve.mjs` uses of it is one property, `fetch`, which it hands to `srvx` and never calls itself.
 * So the double exports exactly that, and `vitest.config.ts` aliases the import onto this file.
 *
 * The identity matters more than the shape: the suite asserts that the object handed to `serve()` is
 * *this* `fetch`, which is what proves the adapter forwards the build's handler rather than one of
 * its own making.
 */
const handler = {
	fetch: (request: Request): Response => new Response(`stub answered ${request.url}`)
}

export default handler
