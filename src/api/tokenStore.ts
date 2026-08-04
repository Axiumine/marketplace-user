/**
 * The access token, in memory only.
 *
 * Never localStorage, never sessionStorage, never a readable cookie: a token that JavaScript can read
 * from storage is a token that any successful XSS can exfiltrate, and it survives the tab that leaked
 * it. Keeping it in a module-scoped variable means a page reload loses it — which is exactly the
 * behaviour the refresh flow is built around. The refresh token itself is a signed httpOnly cookie this
 * code cannot see at all, so a reload re-mints the access token from the cookie and nothing was ever
 * persisted client-side.
 *
 * ⚠️ This module is **client-only**, and in an SSR app that is a rule rather than a description. A
 * module-scoped variable on the server is shared by every concurrent request, so a token written here
 * during server rendering would be handed to the next visitor whose request happened to land on the
 * same process. Nothing under `src/routeOptions/` may import it, and the SSR client in src/api/ssr.ts
 * deliberately has no auth exchange at all — the private area is `ssr: false` and never renders on the
 * server, which is what makes that safe rather than merely convenient.
 */
let accessToken: string | null = null

export const getAccessToken = (): string | null => accessToken

export const setAccessToken = (token: string): void => {
	accessToken = token
}

export const clearAccessToken = (): void => {
	accessToken = null
}
