import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/**
 * SSR app, single origin.
 *
 * The five GraphQL endpoints are reached through same-origin paths (`/public-resource`,
 * `/user-authenticated-resource`, …) that nginx proxies to the services. That is not a convenience:
 * the refresh token is a signed httpOnly cookie, and a cross-origin request would need both
 * `SameSite=None` on the cookie and a CORS allow-list on every service to carry it. Single origin
 * removes the whole problem, and `credentials: 'include'` in the fetch options is then enough.
 *
 * In development nginx is not in the picture, so the proxy table below stands in for it — and here it
 * serves the SSR loaders too, which fetch `/public-resource` against the dev server's own origin. The
 * ports are the ones in each service's `env` template; a service that is not running fails that one
 * endpoint and leaves the rest of the app working.
 *
 * `PORT` is read through `loadEnv` rather than hardcoded, so the `env` template stays the single place
 * the port is written — the same invariant every backend service holds. The third argument is `''` (no
 * prefix filter) because `PORT` is a build-time-only variable and deliberately not `VITE_`-prefixed:
 * prefixing it would inline it into the client bundle, where it means nothing.
 */
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '')

	return {
		plugins: [
			/**
			 * Order matters: `tanstackStart()` installs the router generator and the server/client
			 * environments, and `@vitejs/plugin-react` has to transform what comes out of them. It is added
			 * by hand rather than by the framework — this version of the plugin no longer bundles it.
			 *
			 * ⚠️ The generator is why this app has `src/routes/` at all, where the other two apps declare
			 * their route tree in `src/router.tsx`. The plugin always runs it over `routesDirectory` into
			 * `generatedRouteTree`, and the SSR entry resolves the router through the generated tree, so a
			 * hand-written tree would be overwritten on every dev-server start. What was kept instead is
			 * the testability the hand-written tree bought: every file under `src/routes/` is a one-line
			 * `createFileRoute(...)(options)` call, and the `options` object lives in `src/routeOptions/`
			 * as a plain constant that imports nothing from the router. See README §3.1.
			 *
			 * `quoteStyle` / `semicolons` make the generated tree come out already matching `.prettierrc`,
			 * so `yarn lint:check` does not fail on a file nobody wrote. It is in `.prettierignore` too —
			 * belt and braces, because the generator's formatting is not a contract.
			 *
			 * ⚠️ **The two `router` paths are relative to `srcDirectory`, not to the project root**, and the
			 * plugin joins them without checking. Writing the obvious `'src/routes'` here resolves to
			 * `src/src/routes` and the build dies with
			 * `ENOENT: no such file or directory, scandir '<repo>/src/src/routes'` — a path nobody typed,
			 * from a config that never mentions `src` twice.
			 *
			 * ⚠️ **`autoCodeSplitting` is not settable here, and it is already on.** The Start plugin builds
			 * its router options as `configSchema.omit({ autoCodeSplitting: true, target: true })` and then
			 * hardcodes the value, so writing it out is a type error
			 * (`TS2353: … 'autoCodeSplitting' does not exist in type …`) rather than a redundant line.
			 *
			 * It also splits nothing here, and that is a consequence of the one-liner route pattern above
			 * rather than a bug: the splitter reads the `component` / `loader` properties written literally
			 * inside `createFileRoute(...)({ … })`, and these route files hand it an imported identifier it
			 * cannot see into. The heavy chunk is split anyway, by `MapIsland`'s dynamic import, which is the
			 * one that was ever worth splitting. README §7 carries the measured numbers.
			 */
			tanstackStart({
				srcDirectory: 'src',
				router: {
					routesDirectory: 'routes',
					generatedRouteTree: 'routeTree.gen.ts',
					quoteStyle: 'single',
					semicolons: false
				}
			}),
			react(),
			tailwindcss()
		],
		resolve: {
			alias: {
				'@': fileURLToPath(new URL('./src', import.meta.url)),
				'@gql': fileURLToPath(new URL('./src/gql', import.meta.url))
			}
		},
		server: {
			host: '127.0.0.1',
			port: Number(env.PORT ?? 3045),
			proxy: {
				'/public-resource': 'http://127.0.0.1:4027',
				'/public-authorization': 'http://127.0.0.1:4028',
				'/user-authenticated-authorization': 'http://127.0.0.1:4031',
				'/user-authenticated-resource': 'http://127.0.0.1:4032',
				'/logout': 'http://127.0.0.1:4030'
			}
		},
		build: {
			sourcemap: true
		}
	}
})
