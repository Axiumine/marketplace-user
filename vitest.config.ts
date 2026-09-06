import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import type { PluginOption } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * One project, jsdom, and deliberately **without** `tanstackStart()` in the plugin list.
 *
 * The framework plugin installs two Vite environments (`client` and `ssr`), a router generator that
 * rewrites `src/routeTree.gen.ts` on start, and a server-function transform. None of that is wanted in
 * a test run: the generator would race the suite for the same file, and the environments turn one
 * vitest project into two builds of everything. What the tests actually exercise is the layer below —
 * the loaders, head builders and search schemas in `src/routeOptions/`, which are plain objects that
 * import nothing from the router. That is exactly why they live there. See README §3.1.
 *
 * Coverage is gated at 100 on all four metrics, the same as every other repo on the platform. The
 * exclusions below are code that is not this app's to test — generated codegen and router output, the
 * two framework entries that only run inside a real server or a real browser, and the Sentry init that
 * is a single side-effecting call.
 */
/**
 * `import appCss from '../styles.css?url'` in `src/routeOptions/root.tsx`.
 *
 * Vite answers that with the emitted asset's hashed URL at build time; a test run has no asset pipeline
 * and resolves it to the empty string, which reaches React as `<link rel="stylesheet" href="">` and is
 * reported on stderr for every single router render — "An empty string ("") was passed to the href
 * attribute". Noise that constant hides the one warning worth reading.
 *
 * A fixed stand-in rather than the real hashed name: the hash changes with the stylesheet, and a test
 * asserting it would fail on an unrelated CSS edit. What the head test asserts is that the link is
 * there with `rel="stylesheet"`, which is the part the first paint depends on.
 */
const cssUrlStub = (): PluginOption => {
	const RESOLVED = '\0vitest-css-url-stub'

	return {
		name: 'css-url-stub',
		enforce: 'pre',
		resolveId: (id) => (id.endsWith('.css?url') ? RESOLVED : undefined),
		load: (id) => (id === RESOLVED ? "export default '/assets/styles.css'" : undefined)
	}
}

export default defineConfig({
	plugins: [react(), cssUrlStub()],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
			'@gql': fileURLToPath(new URL('./src/gql', import.meta.url)),
			/*
			 * `serve.mjs` imports the SSR handler `vite build` emits, and that file is a build artifact
			 * outside git: on a tree that has not built, resolving it fails and the adapter cannot be
			 * loaded at all. `yarn test` does not build — minutes of `vite build` to reach forty-seven
			 * lines that never call the handler, only pass it on — so the import is aliased onto a
			 * double exporting the one property the adapter reads.
			 *
			 * ⚠️ **The key is the exact specifier `serve.mjs` writes.** Vite matches a string alias as a
			 * prefix of the raw importee, so this rewrites that one import and nothing else; a shorter
			 * key here would silently catch every `./dist/...` import a future file makes.
			 */
			'./dist/server/server.js': fileURLToPath(new URL('./test/doubles/ssrHandler.ts', import.meta.url))
		}
	},
	test: {
		globals: true,
		environment: 'jsdom',
		// Dates on the customer screens are formatted through `Intl`, which reads the ambient zone.
		// Without a fixed one the same assertion passes on a machine an hour ahead of UTC and fails in
		// UTC — and the failure is an hour, which reads as a bug in the formatter rather than as a
		// machine difference.
		//
		// The test scripts export `TZ=UTC` as well, and both are needed. This setting reaches the worker
		// through `process.env`, which is enough for vitest's own pool; Stryker's runner uses a pool where
		// assigning `process.env.TZ` does not move ICU's zone.
		//
		// The `VITE_*` keys are pinned empty on purpose, and the emptiness is the point rather than a
		// placeholder. Vite loads `.env` into `import.meta.env` for a test run exactly as it does for a
		// build, so on a machine that followed the README's `cp env .env` the suite would assert against
		// that developer's site URL, geocoder host and Turnstile key. `readEnv` treats an empty string as
		// absent — dotenv writes `KEY=` for "unset" — so every value falls back to the default in
		// `src/env.ts`, which is the same on every machine. A test that needs a different one stubs it with
		// `vi.stubEnv` and re-imports.
		env: {
			TZ: 'UTC',
			VITE_GRAPHQL_ENDPOINT_PUBLIC_RESOURCE: '',
			VITE_GRAPHQL_ENDPOINT_PUBLIC_AUTHORIZATION: '',
			VITE_GRAPHQL_ENDPOINT_USER_AUTHENTICATED_AUTHORIZATION: '',
			VITE_GRAPHQL_ENDPOINT_USER_AUTHENTICATED_RESOURCE: '',
			VITE_GRAPHQL_ENDPOINT_LOGOUT: '',
			VITE_SITE_URL: '',
			VITE_TURNSTILE_SITE_KEY: '',
			VITE_MAP_STYLE_URL: '',
			VITE_PMTILES_URL: '',
			VITE_NOMINATIM_URL: '',
			VITE_SENTRY_DSN: '',
			VITE_SENTRY_ENVIRONMENT: '',
			PUBLIC_RESOURCE_URL: ''
		},
		// Order matters: the polyfill has to run before anything imports react-dom, and `vitest.setup.ts`
		// imports it transitively on its second line.
		setupFiles: ['./vitest.polyfill.ts', './vitest.setup.ts'],
		include: ['test/**/*.test.{ts,tsx}'],
		restoreMocks: true,
		// The GraphQL helper replaces `globalThis.fetch`. Without this the replacement outlives the test
		// that installed it, and the next file's first request answers with the previous file's fixture.
		unstubGlobals: true,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			/*
			 * `src/`, plus the one source file outside it: `serve.mjs` is `yarn start`, forty-seven lines
			 * that bind the loopback interface and hand the build's handler to srvx. It sat outside every
			 * glob until 2026-09-06 — not excluded, never looked at, which is a weaker position than an
			 * exclusion (RISK_REGISTER R61) — and `scripts/runnable-source-check.mjs` in the parent
			 * workspace now fails when a path this package hands to `node` is gated by neither.
			 */
			include: ['src/**/*.{ts,tsx}', 'serve.mjs'],
			exclude: [
				// Generated by graphql-codegen on every `yarn codegen`. Editing it is pointless and testing
				// it tests the generator.
				'src/gql/**',
				// Written by TanStack Router's generator on every dev-server start and every build. Same
				// argument, and it is not even stable between runs.
				'src/routeTree.gen.ts',
				// The two framework entries. `client.tsx` hydrates a real document and `server.ts` is the
				// request handler the node build wraps — neither has a unit, and the one thing they could
				// get wrong (mounting the wrong router) is what every other test already covers.
				'src/client.tsx',
				'src/server.ts',
				// One-line `createFileRoute(...)(options)` modules. The `options` objects they pass are in
				// src/routeOptions/ and are covered there; what is left in these files is the framework's
				// own registration call, which cannot be exercised without booting the plugin.
				'src/routes/**',
				// A single `Sentry.init` call guarded by a DSN check. Asserting it was called asserts that
				// the SDK exists.
				'src/instrument.ts',
				'src/vite-env.d.ts'
			],
			thresholds: {
				statements: 100,
				branches: 100,
				functions: 100,
				lines: 100
			}
		}
	}
})
