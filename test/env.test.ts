import { describe, expect, it } from 'vitest'

import type { AppEnv } from '@/env'
import { DEFAULT_ENDPOINTS, env, readEnv } from '@/env'

/** `ImportMetaEnv` requires four keys Vite always defines; nothing here reads them. */
const source = (over: Record<string, string | undefined> = {}): ImportMetaEnv =>
	({ MODE: 'test', BASE_URL: '/', PROD: false, DEV: true, SSR: false, ...over }) as unknown as ImportMetaEnv

describe('readEnv', () => {
	/*
	 * Every value has a default and nothing throws, which is deliberate rather than lax: the endpoint
	 * paths are fixed by the `ENDPOINT` constant each service exports from its `src/index.mts`, so they
	 * are not configuration at all — the variables exist only so the app can move behind a different
	 * nginx prefix. A missing variable is the normal case.
	 */
	it('reads a complete configuration off an empty environment', () => {
		expect(readEnv(source())).toEqual<AppEnv>({
			...DEFAULT_ENDPOINTS,
			siteUrl: 'http://127.0.0.1:3045',
			turnstileSiteKey: '',
			mapStyleUrl: '/map/style.json',
			pmtilesUrl: '/map/basemap.pmtiles',
			nominatimUrl: '/nominatim',
			sentryDsn: '',
			sentryEnvironment: 'development'
		})
	})

	/*
	 * ⚠️ The three authenticated paths are the **User** tier's — 4031, 4032 and the logout shared by all
	 * three tiers on 4030. `/authenticated-*` is the ShopOwner tier's, and since the tier fix a session
	 * minted here is rejected there with a 403 rather than quietly working.
	 */
	it('defaults the authenticated paths to the user tier, never the shop-owner one', () => {
		const app = readEnv(source())

		expect(app.userAuthorization).toBe('/user-authenticated-authorization')
		expect(app.userResource).toBe('/user-authenticated-resource')
		expect(app.logout).toBe('/logout')
		expect(app.userAuthorization).not.toBe('/authenticated-authorization')
		expect(app.userResource).not.toBe('/authenticated-resource')
	})

	it('defaults the public paths to the two public services', () => {
		const app = readEnv(source())

		expect(app.publicResource).toBe('/public-resource')
		expect(app.publicAuthorization).toBe('/public-authorization')
	})

	// Paths rather than absolute URLs: the app and the services are served from one origin, because the
	// refresh cookie is httpOnly and same-site and cannot cross one.
	it.each(Object.entries(DEFAULT_ENDPOINTS))('defaults %s to a same-origin path', (_key, path) => {
		expect(path.startsWith('/')).toBe(true)
		expect(path).not.toContain('://')
	})

	it('takes a configured value over the default', () => {
		const app = readEnv(
			source({
				VITE_GRAPHQL_ENDPOINT_PUBLIC_RESOURCE: '/api/public-resource',
				VITE_GRAPHQL_ENDPOINT_PUBLIC_AUTHORIZATION: '/api/public-authorization',
				VITE_GRAPHQL_ENDPOINT_USER_AUTHENTICATED_AUTHORIZATION: '/api/user-authorization',
				VITE_GRAPHQL_ENDPOINT_USER_AUTHENTICATED_RESOURCE: '/api/user-resource',
				VITE_GRAPHQL_ENDPOINT_LOGOUT: '/api/logout',
				VITE_TURNSTILE_SITE_KEY: '0x4AAAA',
				VITE_MAP_STYLE_URL: 'https://tiles.example.it/style.json',
				VITE_PMTILES_URL: 'https://tiles.example.it/basemap.pmtiles',
				VITE_SENTRY_DSN: 'https://key@sentry.example.it/1',
				VITE_SENTRY_ENVIRONMENT: 'production'
			})
		)

		expect(app).toEqual<AppEnv>({
			publicResource: '/api/public-resource',
			publicAuthorization: '/api/public-authorization',
			userAuthorization: '/api/user-authorization',
			userResource: '/api/user-resource',
			logout: '/api/logout',
			siteUrl: 'http://127.0.0.1:3045',
			turnstileSiteKey: '0x4AAAA',
			mapStyleUrl: 'https://tiles.example.it/style.json',
			pmtilesUrl: 'https://tiles.example.it/basemap.pmtiles',
			nominatimUrl: '/nominatim',
			sentryDsn: 'https://key@sentry.example.it/1',
			sentryEnvironment: 'production'
		})
	})

	/*
	 * dotenv writes `KEY=` for a variable someone meant to leave unset, and so does the committed `env`
	 * template — so the empty string has to mean absent. Reading it as a value points the app at the
	 * origin `''`, and every canonical link on the site becomes relative.
	 */
	it.each([
		['publicResource', 'VITE_GRAPHQL_ENDPOINT_PUBLIC_RESOURCE', '/public-resource'],
		['publicAuthorization', 'VITE_GRAPHQL_ENDPOINT_PUBLIC_AUTHORIZATION', '/public-authorization'],
		['userAuthorization', 'VITE_GRAPHQL_ENDPOINT_USER_AUTHENTICATED_AUTHORIZATION', '/user-authenticated-authorization'],
		['userResource', 'VITE_GRAPHQL_ENDPOINT_USER_AUTHENTICATED_RESOURCE', '/user-authenticated-resource'],
		['logout', 'VITE_GRAPHQL_ENDPOINT_LOGOUT', '/logout'],
		['siteUrl', 'VITE_SITE_URL', 'http://127.0.0.1:3045'],
		['mapStyleUrl', 'VITE_MAP_STYLE_URL', '/map/style.json'],
		['pmtilesUrl', 'VITE_PMTILES_URL', '/map/basemap.pmtiles'],
		['nominatimUrl', 'VITE_NOMINATIM_URL', '/nominatim'],
		['sentryEnvironment', 'VITE_SENTRY_ENVIRONMENT', 'development']
	])('treats an empty %s as unset', (key, variable, fallback) => {
		expect(readEnv(source({ [variable]: '' }))[key as keyof AppEnv]).toBe(fallback)
	})

	// The two that default to empty, so "unset" and "set to empty" agree by construction. An empty
	// Turnstile key switches the widget off, which is what a dev box wants; an empty DSN switches Sentry
	// off, which is what a test run wants.
	it.each([
		['turnstileSiteKey', 'VITE_TURNSTILE_SITE_KEY'],
		['sentryDsn', 'VITE_SENTRY_DSN']
	])('leaves %s empty, which is what switches the feature off', (key, variable) => {
		expect(readEnv(source({ [variable]: '' }))[key as keyof AppEnv]).toBe('')
		expect(readEnv(source())[key as keyof AppEnv]).toBe('')
	})

	describe('the origins', () => {
		/*
		 * ⚠️ `${siteUrl}${path}` is how every canonical, `og:url` and sitemap entry is built, so one
		 * trailing slash in the environment produces `https://example.it//shops` everywhere at once — a
		 * second URL for every page on the site, competing with the canonical each of those pages emits.
		 */
		it.each([
			['https://www.example.it/', 'https://www.example.it'],
			['https://www.example.it///', 'https://www.example.it'],
			['https://www.example.it', 'https://www.example.it']
		])('strips the trailing slashes off %s', (raw, expected) => {
			expect(readEnv(source({ VITE_SITE_URL: raw })).siteUrl).toBe(expected)
		})

		it('strips them off the geocoder origin too, since a path is appended there as well', () => {
			expect(readEnv(source({ VITE_NOMINATIM_URL: 'https://geo.example.it/' })).nominatimUrl).toBe('https://geo.example.it')
		})

		// Only the trailing ones. A path inside the origin is somebody's nginx prefix and removing it
		// silently routes every request one level up.
		it('leaves a path prefix inside the origin alone', () => {
			expect(readEnv(source({ VITE_SITE_URL: 'https://www.example.it/shop/' })).siteUrl).toBe('https://www.example.it/shop')
		})
	})
})

describe('the module-level env', () => {
	/*
	 * `readEnv(import.meta.env)` runs once at import. vitest.config.ts pins every `VITE_*` key to the
	 * empty string so this is the defaults on every machine — otherwise a developer's own `.env` would
	 * decide what the suite asserts, and the same test would pass here and fail in the hook.
	 */
	it('is the defaults under the pinned test environment', () => {
		expect(env).toEqual(readEnv(source()))
	})
})
