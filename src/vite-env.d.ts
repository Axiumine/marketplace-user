/// <reference types="vite/client" />

/**
 * The `VITE_`-prefixed variables this app reads, typed so `readEnv` in src/env.ts cannot misspell one.
 *
 * All of them are optional: every value in `readEnv` has a default, and a missing variable is the
 * normal case on a developer machine rather than an error.
 *
 * ⚠️ Everything declared here is inlined into the client bundle and is therefore public. A secret
 * added to this interface is a secret published on the web. Server-only configuration is read from
 * `process.env` in src/api/ssr.ts and never appears here.
 */
interface ImportMetaEnv {
	readonly VITE_GRAPHQL_ENDPOINT_PUBLIC_RESOURCE?: string
	readonly VITE_GRAPHQL_ENDPOINT_PUBLIC_AUTHORIZATION?: string
	readonly VITE_GRAPHQL_ENDPOINT_USER_AUTHENTICATED_AUTHORIZATION?: string
	readonly VITE_GRAPHQL_ENDPOINT_USER_AUTHENTICATED_RESOURCE?: string
	readonly VITE_GRAPHQL_ENDPOINT_LOGOUT?: string
	readonly VITE_SITE_URL?: string
	readonly VITE_TURNSTILE_SITE_KEY?: string
	readonly VITE_MAP_STYLE_URL?: string
	readonly VITE_PMTILES_URL?: string
	readonly VITE_NOMINATIM_URL?: string
	readonly VITE_SENTRY_DSN?: string
	readonly VITE_SENTRY_ENVIRONMENT?: string
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
