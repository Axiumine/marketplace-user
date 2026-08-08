/**
 * Build-time configuration, read once from `import.meta.env`.
 *
 * Every value has a default and nothing here throws. That is deliberate for the endpoint paths: they
 * are fixed by the `ENDPOINT` constant each backend service exports from its `src/index.mts`, so they
 * are not really configuration — the env vars exist only so the app can be relocated behind a different
 * nginx prefix without a code change. A missing variable is therefore the normal case, not an error.
 *
 * ⚠️ Everything in here is **public**. `import.meta.env` values are inlined into the client bundle at
 * build time, so a `VITE_`-prefixed variable is readable by anyone who opens the page. Nothing secret
 * may be added: not `INTROSPECTION_CODE`, not a Turnstile *secret* key (the site key below is the
 * public half and is meant to be seen), not a database URL. Server-only configuration lives in
 * `src/api/ssr.ts`, which reads `process.env` and is never bundled for the browser.
 *
 * ⚠️ The three authenticated paths are the **User** tier's — 4031, 4032, and the shared logout on 4030.
 * They are different services from the shop-owner and operator apps', backed by a different collection
 * and a different session tier. Since the Phase 0 tier fix, pointing this app at another tier's path
 * fails closed with a 403 rather than quietly succeeding.
 */
export interface AppEnv {
	readonly publicResource: string
	readonly publicAuthorization: string
	readonly userAuthorization: string
	readonly userResource: string
	readonly logout: string
	/**
	 * Absolute origin this site is served from, e.g. `https://www.example.it`. Canonical links, `og:url`
	 * and the sitemap need an absolute URL — a crawler treats a relative canonical as no canonical at
	 * all, and two hostnames serving the same page then compete with each other in the index.
	 */
	readonly siteUrl: string
	/** Public half of the Turnstile key pair. Empty disables the widget, which is what a dev box wants. */
	readonly turnstileSiteKey: string
	/** MapLibre style JSON. Points at the self-hosted Protomaps basemap; see the parent workspace's `nginx/`. */
	readonly mapStyleUrl: string
	/** The PMTiles archive the style's source resolves through `pmtiles://`. */
	readonly pmtilesUrl: string
	/** On-premises Nominatim, for address autocomplete in the account area. See docs/nominatim. */
	readonly nominatimUrl: string
	readonly sentryDsn: string
	readonly sentryEnvironment: string
}

/**
 * Defaults, kept together so the `env` template and this file can be diffed by eye.
 *
 * The endpoints are paths, not URLs: the app and the services are served from one origin (see the
 * comment in vite.config.ts for why the refresh cookie makes that mandatory rather than convenient).
 */
export const DEFAULT_ENDPOINTS = {
	publicResource: '/public-resource',
	publicAuthorization: '/public-authorization',
	userAuthorization: '/user-authenticated-authorization',
	userResource: '/user-authenticated-resource',
	logout: '/logout'
} as const

/** An empty string is treated as absent — dotenv writes `KEY=` for "unset", and so does the template. */
const value = (raw: string | undefined, fallback: string): string => (raw === undefined || raw === '' ? fallback : raw)

/** Trailing slashes are stripped so `${siteUrl}${path}` never produces a double slash in a canonical. */
const origin = (raw: string | undefined, fallback: string): string => value(raw, fallback).replace(/\/+$/, '')

export const readEnv = (source: ImportMetaEnv): AppEnv => ({
	publicResource: value(source.VITE_GRAPHQL_ENDPOINT_PUBLIC_RESOURCE, DEFAULT_ENDPOINTS.publicResource),
	publicAuthorization: value(source.VITE_GRAPHQL_ENDPOINT_PUBLIC_AUTHORIZATION, DEFAULT_ENDPOINTS.publicAuthorization),
	userAuthorization: value(source.VITE_GRAPHQL_ENDPOINT_USER_AUTHENTICATED_AUTHORIZATION, DEFAULT_ENDPOINTS.userAuthorization),
	userResource: value(source.VITE_GRAPHQL_ENDPOINT_USER_AUTHENTICATED_RESOURCE, DEFAULT_ENDPOINTS.userResource),
	logout: value(source.VITE_GRAPHQL_ENDPOINT_LOGOUT, DEFAULT_ENDPOINTS.logout),
	siteUrl: origin(source.VITE_SITE_URL, 'http://127.0.0.1:3045'),
	turnstileSiteKey: value(source.VITE_TURNSTILE_SITE_KEY, ''),
	mapStyleUrl: value(source.VITE_MAP_STYLE_URL, '/map/style.json'),
	pmtilesUrl: value(source.VITE_PMTILES_URL, '/map/basemap.pmtiles'),
	nominatimUrl: origin(source.VITE_NOMINATIM_URL, '/nominatim'),
	sentryDsn: value(source.VITE_SENTRY_DSN, ''),
	sentryEnvironment: value(source.VITE_SENTRY_ENVIRONMENT, 'development')
})

export const env: AppEnv = readEnv(import.meta.env)
