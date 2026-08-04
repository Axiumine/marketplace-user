/*
 * The production entry point: `yarn start`.
 *
 * ⚠️ **`vite build` does not emit a server that listens, and that is the reason this file exists.**
 * TanStack Start writes `dist/server/server.js`, whose default export is `{ fetch }` — a WinterCG handler
 * and nothing more. There is no `dist/server/index.mjs` and no `.output/` directory: the `.output` path
 * belongs to the Nitro preset, which this app does not install, so a `start` script pointing there fails
 * with `ERR_MODULE_NOT_FOUND` against a build that succeeded. Fifteen lines of adapter beat a second
 * build system for a process that does one thing.
 *
 * `srvx` is the same server h3 v2 uses underneath, so it is already in the tree as a transitive
 * dependency — it is listed as a direct one anyway, because importing a package that only happens to be
 * installed is a break waiting for the day the transitive path changes.
 *
 * ⚠️ **This process serves SSR responses only. It does not serve `dist/client`.** nginx does, straight
 * off disk with an immutable cache header (`docs/nginx/marketplace-user.conf` roots at
 * `/srv/marketplace-user/dist/client`), which is both faster and one less thing for Node to do while it
 * is rendering. The consequence to know about: run this without nginx in front and every asset 404s. For
 * looking at a production build locally, `yarn preview` serves both.
 */
import { serve } from 'srvx/node'

import handler from './dist/server/server.js'

/*
 * ⚠️ Binds the loopback interface, unlike the seven backend services, which bind the wildcard.
 *
 * That asymmetry is deliberate rather than an oversight. Their integration suites fetch
 * `http://127.0.0.1:<port>` and need the wildcard; nothing here is tested over the network, and this
 * process has no authentication of its own — it renders whatever it is asked for and forwards the
 * session cookie. Reachable from the LAN, it is a way around every rate limit and cache rule nginx
 * enforces in front of it.
 */
const HOSTNAME = '127.0.0.1'

// No default. A port read from the environment that silently falls back is a process listening somewhere
// nobody configured, and the one thing worse than a start-up failure is a start-up success on port 3000.
const port = Number(process.env.PORT)

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
	console.error(`PORT must be an integer between 1 and 65535, got ${JSON.stringify(process.env.PORT)}`)
	process.exit(1)
}

serve({ fetch: handler.fetch, port, hostname: HOSTNAME })

console.log(`marketplace-user SSR listening on http://${HOSTNAME}:${port}`)
