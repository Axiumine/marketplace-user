# marketplace-user

The customer app (`User` tier) for Marketplace: the public, indexed site **and** the private account
area, in one codebase. Read the parent workspace's
`/media/nvme/websites/fullstack-marketplace-blueprint/CLAUDE.md` first — this is one of fourteen sub-repos
and almost nothing here is changeable on its own. `README.md` carries the strategy and every rejected
alternative; `COVERAGE.md` carries the gate policy.

⚠️ **This is the only server-rendered app on the platform.** The other two frontends are SPAs. Everything
below that reads as unnecessary ceremony is there because a request is rendered on a shared Node process
before any browser is involved.

⚠️ **Language: everything is English** — identifiers, UI text, routes, comments. Italian survives in two
deliberate places only: domain terms with no English equivalent in prose (*partita IVA* = `vatNumber`,
*codice fiscale* = `taxCode`, *PEC* = `certifiedEmail`) and the `it-IT` collator used to order categories,
which is a market choice and not a name. `<html lang="it">` is set for the same market reason.

## Public is server-rendered, private is not

| Surface | Routes | Mode |
|---|---|---|
| Catalogue | `/`, `/shops`, `/shops/:city`, `/shop/:slug`, `/shop/:slug/item/:itemSlug`, `/category/:slug[/:childSlug]` | SSR |
| Search | `/search?q=&near=` | SSR, `noindex` |
| Machine-readable | `/robots.txt`, `/sitemap.xml`, `/sitemaps/:kind/:cursor` | server handlers |
| Account | `/login`, `/register`, `/reset-password*`, `/account/*` | **`ssr: false`** |

⚠️ **Never turn SSR on for an `/account` route.** Rendering authenticated HTML on a server that sits
behind a shared `proxy_cache` is how one customer's personal data ends up in another customer's response.
The cache bypasses on the session cookie (`docs/nginx/cache.conf`), so the two rules are one mechanism —
weakening either alone is enough to leak. There is also nothing to gain: an account page has no SEO value.

## The four endpoints are the **user** tier's

| Path | Service | Port |
|---|---|---|
| `/public-resource` | `marketplace-dev-public-resource` | 4027 |
| `/public-authorization` | `marketplace-dev-public-authorization` | 4028 |
| `/user-authenticated-authorization` | `marketplace-dev-user-authenticated-authorization` | 4031 |
| `/user-authenticated-resource` | `marketplace-dev-user-authenticated-resource` | 4032 |
| `/logout` | `marketplace-dev-authenticated-logout` | 4030 |

⚠️ **`/authenticated-*` (4026 / 4029) belongs to the ShopOwner tier and pointing anything here at it now
fails closed** — since the Phase 0 tier fix a session carries a `tier` field and a service rejects a token
minted for another one with a 403. `/logout` is shared by all three tiers on purpose: that resolver
deletes Redis keys by token content and never asks which collection minted them.

The SSR server does **not** use those browser-facing paths. It reads `PUBLIC_RESOURCE_URL` — deliberately
un-prefixed, because a `VITE_` variable is inlined into the client bundle and this one names a loopback
address — and talks to public-resource directly, skipping nginx.

## Route files are one-liners; the behaviour is in `src/routeOptions/`

`src/routes/x.tsx` is `createFileRoute('/x')(xRouteOptions)` and nothing else. The options object is a
plain constant that imports nothing from the router, which is what makes loaders, `head` and
`validateSearch` testable without mounting one. Keep the pattern when adding a route.

Its one cost, measured and accepted: the framework's route-level code splitter reads literal properties
inside `createFileRoute(...)({ … })` and cannot see into an imported identifier, so no route is split out
of the entry chunk. The chunk that mattered is split anyway — see the map below. README §7 has the numbers.

## Things that bite

- **`vite.config.ts`: `router.routesDirectory` and `router.generatedRouteTree` are relative to
  `srcDirectory`, not to the project root.** Writing `'src/routes'` resolves to `src/src/routes` and the
  build dies with an `ENOENT` naming a path nobody typed. They are `'routes'` and `'routeTree.gen.ts'`.
- **`autoCodeSplitting` cannot be set.** Start builds its router options as
  `configSchema.omit({ autoCodeSplitting: true, target: true })`, so writing it is a type error.
- **`src/routeTree.gen.ts` is committed, and prettier ignores it.** `yarn build` runs `tsc --noEmit`
  *before* vite generates it, so a clone without the file fails to type-check.
- **`src/lib/seo.ts`'s `HeadContent` holds mutable arrays deliberately.** The router's
  `UpdatableRouteOptions` declares `meta` and `links` as mutable, and TypeScript refuses `readonly T[]`
  where `T[]` is expected. Marking them `readonly` breaks *every* `createFileRoute` call with an error
  that names `DetailedHTMLProps<LinkHTMLAttributes<…>>` and never mentions `seo.ts`.
- **Paginated routes declare `page` as `.catch(1).optional()`.** TanStack derives the requiredness of the
  `search` prop from the *output* type: without `.optional()` every `<Link to="/shops">` in the app must
  pass `search={{ page: 1 }}` and then emits `/shops?page=1` — a second URL for page 1, competing in the
  index with the canonical the same route emits. `pageNumber()` normalises in `loaderDeps` so an absent
  `?page=` and an explicit `?page=1` produce one cache key.
- **`tsconfig.json` pins `types` to three entries**, which switches off automatic `@types/*` inclusion —
  so the ambient `GeoJSON` namespace is not in scope and those types are imported from `geojson`.
  `maplibre-gl` 6 has **no default export**; it is a namespace import.
- **`exactOptionalPropertyTypes: true`.** A prop a call site always passes, whose *value* may be
  `undefined`, must be declared `x?: T | undefined`. A bare `x?: T` rejects it.
- **Coordinates are checked, never cast.** `Point.coordinates` is `number[]`;
  `as readonly [number, number]` does not compile and the mutable variant compiles into a `NaN` centre.
  Use `toLngLat` / `toMutableLngLat` from `src/lib/geo.ts`.
- **`setState` in an effect body is an eslint error** (`react-hooks/set-state-in-effect`), not a warning.
  Clearing state that a keystroke caused belongs in the change handler; inside a debounce timer is fine.
- **`yarn start` runs `serve.mjs`, not the build output.** `vite build` emits `dist/server/server.js`,
  whose default export is `{ fetch }` — a handler with no listener. There is no `.output/` here: that path
  belongs to the Nitro preset, which this app does not install. The process serves SSR only; nginx serves
  `dist/client`.

## The map is an island, and that is load-bearing

`src/features/map/ShopMap.tsx` is reachable **only** through `MapIsland`'s dynamic import. Importing it
statically from a route puts ~950 KB of MapLibre into the entry chunk of every catalogue page, including
the ones with no map, and breaks SSR outright — the module touches `window` and WebGL at module scope.
`MapIsland`'s placeholder reserves the final height on purpose: an island mounting into a zero-height box
is a Cumulative Layout Shift, so never render the fallback as `null`.

Every pin is also a real `<a href>` in the listing beside it. The map is a way to look at the catalogue,
never the only route into a page.

## Commands

```bash
yarn dev            # vite on http://127.0.0.1:3045, GraphQL paths proxied to 4027/4028/4030/4031/4032
yarn codegen        # regenerate src/gql/ from schema/*.graphql — one project per access level
yarn build          # codegen && tsc --noEmit && vite build
yarn start          # node serve.mjs — SSR only, needs PORT set, no default
yarn lint           # eslint --fix + prettier --write   (lint:check for CI and the hooks)
yarn test  test:cov  test:mutation   # gated at 100 / 100
```

⚠️ **`schema/*.graphql` are hand-maintained slices, not the contract.** No service has an SDL file; all of
them build their schema programmatically, so the resolvers are the source of truth and these slices drift.
Re-check against the resolver before adding or changing an operation.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **marketplace-user**. Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/marketplace-user/context` | Codebase overview, check index freshness |
| `gitnexus://repo/marketplace-user/clusters` | All functional areas |
| `gitnexus://repo/marketplace-user/processes` | All execution flows |
| `gitnexus://repo/marketplace-user/process/{name}` | Step-by-step execution trace |

## Cross-Repo Groups

This repository is listed under GitNexus **group(s): marketplace-platform** (see `~/.gitnexus/groups/`). For cross-repo analysis, use MCP tools `impact`, `query`, and `context` with `repo` set to `@<groupName>` or `@<groupName>/<memberPath>` (paths match keys in that group’s `group.yaml`). Use `group_list` / `group_sync` for membership and sync. From the project root: `node .gitnexus/run.cjs group list`, `node .gitnexus/run.cjs group sync <name>`, `node .gitnexus/run.cjs group impact <name> --target <symbol> --repo <group-path>` (the `.gitnexus/run.cjs` path is repo-root-relative).

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
