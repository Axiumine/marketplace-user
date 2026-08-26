# marketplace-user

Customer app, `User` tier. Public indexed site **and** private account area, one codebase.

**Read parent first** — [`../CLAUDE.md`](https://github.com/Axiumine/fullstack-marketplace-blueprint/blob/main/CLAUDE.md)
One of fifteen sub-repos; almost nothing here is changeable on its own.

| Need | File |
|---|---|
| strategy, every rejected alternative, chunk numbers | [`README.md`](./README.md) |
| gate policy | [`COVERAGE.md`](./COVERAGE.md) |
| anything cross-repo | parent `CLAUDE.md` |

⚠️ **Only server-rendered app on the platform.** Other two frontends are SPAs. Anything below that reads
as ceremony is there because a request renders on a shared Node process before any browser exists.

## ⚠️ NEVER run the mutation gate by hand

`yarn test:mutation` is **hook-only**. It runs when the `pre-push` hook calls it and at no other time —
not to check a change, not before a commit, not on one file, not to confirm a survivor is fixed. Do not
invoke `stryker` directly either.

This does not weaken anything: the threshold stays 100, `pre-push` still blocks, and no survivor is ever
answered by lowering a number. What changes is **who starts the run**. A full pass costs tens of minutes
and holds the whole machine at 28 workers while it lasts, so an on-demand run is time taken from the
person waiting for the work.

A hand-started run is usually **wrong** as well as slow: `npx stryker run` skips what the `test:mutation`
script exports (`TZ=UTC`), so the suite fails in Stryker's dry run on a timezone-dependent assertion and
the whole run aborts before a single mutant is tested.

A survivor is answered by writing the test it names and letting the next push run the gate. If a mutant
has to be reproduced first, apply it by hand in the source and run `yarn test` — that is seconds, it
names the tests that should have failed, and it costs nobody the machine.

## Routes

| Surface | Routes | Mode |
|---|---|---|
| Catalogue | `/`, `/shops`, `/shops/:city`, `/shop/:slug`, `/shop/:slug/item/:itemSlug`, `/category/:slug[/:childSlug]` | SSR |
| Search | `/search?q=&near=` | SSR, `noindex` |
| Notice | `/privacy` | SSR, **indexed** |
| Machine-readable | `/robots.txt`, `/sitemap.xml`, `/sitemaps/:kind/:cursor` | server handlers |
| Account | `/login`, `/register`, `/register/seller`, `/reset-password` | SSR, `noindex` |
| Reset confirm | `/reset-password/confirm` | **`ssr: false`**, `noindex` |
| Account area | `/account/*` | **`ssr: false`** |

⚠️ **`ssr: false` is two routes, and the table above is the corrected one.** It used to list `/login`,
`/register` and `/reset-password*` as client-only; measured, they are server-rendered and always were —
`src/routeOptions/login.tsx` says so in its own header. The only `ssr: false` in the repo were
`src/routeOptions/account.tsx` and, since E12-S26, `src/routeOptions/resetPasswordConfirm.tsx`.

⚠️ **Two registrations live here, writing two different collections.** `/register` → `userRegister` →
`user`; `/register/seller` → `shopOwnerRegister` → `shopOwner`, `waitApprov: true`. Both are on
public-resource (4027) and both answer `true` for an address they will not act on, so a form pointed at
the wrong mutation reports success while creating the wrong kind of account — the operation name is the
only thing that says which collection was written, which is why the tests assert it. Nothing on the
platform converts one into the other (ADR-002), so the copy on each page has to send the other audience
away: `/register` offers the seller's page, `/register/seller` offers the customer's, and the footer
carries both. ⚠️ **No sign-in link on the seller page** — `/login` here authenticates against `user` and
would refuse a shop owner with the same message a wrong password gets. The shop area is a separate app
on an origin this repo is not configured with, and the activation mail is what carries the link to it.

⚠️ **`/privacy` is the public half of a configuration in another repo.** It states the retention the edge
keeps — 14 days, `shred` on removal — and `marketplace-nginx/logrotate.d/nginx` in the **parent workspace**
is what enforces it. Changing the period there without changing the page turns the page into a false
statement, so the two move together and the configuration wins. It is the one non-catalogue page that is
**not** `noIndex` and is not disallowed in `robots.txt`: a notice a data subject cannot find is not a
notice. Its only entry point is the footer, which the root route renders on every page.

⚠️ **The reset credential lives in the URL fragment, and the confirm route is why.** The mail sends
`…/reset-password/confirm#/<address>/<hash>` — built by `RESET_PATH_USER` in
`marketplace-dev-public-resource/src/lib/access/resetPwdFlowUser.mts`, whose **trailing `#`** is the whole
mechanism — and RFC 3986 §3.5 keeps a fragment out of every request line, log, `Referer` and cache key.
Three things hold it up and all three have to stay: `src/features/auth/resetLink.ts` reads
`window.location.hash` (never the router's decoded copy), the route is `ssr: false` so the server has
nothing to render and nothing to dehydrate, and `src/lib/cachePolicy.ts` sends `private, no-store` for the
whole `/reset-password` prefix. Adding a path parameter to this route puts the credential back into the
URL **and** into the dehydrated body — measured before the change, both halves were in the HTML.

⚠️ **Never turn SSR on for an `/account` route.** Rendering authenticated HTML on a server that sits
behind a shared `proxy_cache` is how one customer's personal data ends up in another customer's response.
The cache bypasses on the session cookie (`marketplace-nginx/conf.d/30-cache.conf` in the **parent workspace**), so the
two rules are one mechanism — weakening either alone is enough to leak. Nothing to gain either: an account
page has no SEO value.

## Endpoints — user tier only

| Path | Service | Port |
|---|---|---|
| `/public-resource` | `marketplace-dev-public-resource` | 4027 |
| `/public-authorization` | `marketplace-dev-public-authorization` | 4028 |
| `/user-authenticated-authorization` | `marketplace-dev-user-authenticated-authorization` | 4031 |
| `/user-authenticated-resource` | `marketplace-dev-user-authenticated-resource` | 4032 |
| `/logout` | `marketplace-dev-authenticated-logout` | 4030 |

⚠️ **`/authenticated-*` (4026 / 4029) is the ShopOwner tier — pointing anything here at it fails closed.**
A session carries a `tier` field and a service 403s a token minted for another one. `/logout` is shared by
all three tiers on purpose: it deletes Redis keys by token content, never asking which collection minted
them.

SSR server does **not** use those browser-facing paths. It reads `PUBLIC_RESOURCE_URL` — deliberately
un-prefixed, since a `VITE_` variable is inlined into the client bundle and this one names a loopback
address — and talks to public-resource directly, skipping nginx.

## Route files are one-liners

`src/routes/x.tsx` = `createFileRoute('/x')(xRouteOptions)`, nothing else. The options object imports
nothing from the router → loaders, `head` and `validateSearch` testable without mounting one. Keep the
pattern. Cost, measured and accepted: no route splits out of the entry chunk (README §7). The one chunk
that mattered is split anyway — see the map section.

## Things that bite

- **`vite.config.ts`: `router.routesDirectory` / `router.generatedRouteTree` resolve against `srcDirectory`,
  not the project root.** `'src/routes'` → `src/src/routes`, and the build dies with an `ENOENT` naming a
  path nobody typed. They are `'routes'` and `'routeTree.gen.ts'`.
- **`autoCodeSplitting` cannot be set.** Start builds router options as
  `configSchema.omit({ autoCodeSplitting: true, target: true })` → writing it is a type error.
- **`src/routeTree.gen.ts` is committed, and prettier ignores it.** `yarn build` runs `tsc --noEmit`
  *before* vite generates it → a clone without the file fails to type-check.
- **`src/lib/seo.ts`'s `HeadContent` holds mutable arrays deliberately.** The router's
  `UpdatableRouteOptions` declares `meta` and `links` mutable, and TS refuses `readonly T[]` where `T[]` is
  expected. Marking them `readonly` breaks *every* `createFileRoute` call with an error naming
  `DetailedHTMLProps<LinkHTMLAttributes<…>>` that never mentions `seo.ts`.
- **Paginated routes declare `page` as `.catch(1).optional()`.** TanStack derives requiredness of `search`
  from the *output* type: without `.optional()` every `<Link to="/shops">` must pass `search={{ page: 1 }}`
  and emits `/shops?page=1` — a second URL for page 1, competing in the index with the canonical the same
  route emits. `pageNumber()` normalises in `loaderDeps` so absent `?page=` and explicit `?page=1` share one
  cache key.
- **`tsconfig.json` pins `types` to three entries** → automatic `@types/*` inclusion off, ambient `GeoJSON`
  namespace out of scope, those types imported from `geojson`. `maplibre-gl` 6 has **no default export** —
  namespace import.
- **`exactOptionalPropertyTypes: true`.** A prop always passed whose *value* may be `undefined` must be
  declared `x?: T | undefined`. Bare `x?: T` rejects it.
- **Coordinates are checked, never cast.** `Point.coordinates` is `number[]`; `as readonly [number, number]`
  does not compile and the mutable variant compiles into a `NaN` centre. Use `toLngLat` /
  `toMutableLngLat` from `src/lib/geo.ts`.
- **`setState` in an effect body is an eslint *error*** (`react-hooks/set-state-in-effect`), not a warning.
  Clearing state a keystroke caused belongs in the change handler; inside a debounce timer is fine.
- **`yarn start` runs `serve.mjs`, not the build output.** `vite build` emits `dist/server/server.js`,
  default export `{ fetch }` — a handler with no listener. No `.output/` here: that path belongs to the
  Nitro preset, which this app does not install. The process serves SSR only; nginx serves `dist/client`.
- **Every component under `src/components/` and `src/features/` carries a snapshot**, and a new component
  keeps that whole. Take it at `renderWithRouter` / `renderWithClient` level: `renderRoute` mounts the root
  route's `shellComponent`, so it snapshots a whole HTML document rather than a fragment. `vitest.setup.ts`
  normalises React's `useId` output, so a test inserted above a snapshot does not renumber it. `vitest run`
  never rewrites a snapshot — drift fails the suite, and `yarn test -u` accepts a regression as readily as
  a fix.

## The maps are islands, and that is load-bearing

Two MapLibre modules, each reachable **only** through its island's dynamic import:
`src/features/map/ShopMap.tsx` behind `MapIsland` (catalogue pins, read-only) and
`src/features/map/PositionPicker.tsx` behind `PositionPickerIsland` (the address form's draggable pin).
Importing either statically puts ~950 KB of MapLibre into the entry chunk of every page, including the
ones with no map, and breaks SSR outright — the modules touch `window` and WebGL at module scope. Route
files here do not code-split, so "statically" includes a single `import` in one route options object.

⚠️ **`src/features/map/pmtiles.ts` carries the same rule and does not look like it does.** It is a
registration flag and no WebGL, but it imports `maplibre-gl`, so importing it from anything a route loads
statically drags the whole library in regardless. Its `protocolRegistered` flag is module scope
deliberately and has to stay *shared* between the two maps: it exists to keep
`maplibregl.addProtocol('pmtiles', …)` from running twice per document, and two copies of a flag prevent
nothing.

Each island's placeholder reserves the final height on purpose: an island mounting into a zero-height box
is a Cumulative Layout Shift, so never render the fallback as `null`. Both heights are CSS variables —
`--map-height` for the catalogue, `--map-pick-height` for the shorter box in the form — so a placeholder
and its map cannot disagree.

Every pin is also a real `<a href>` in the listing beside it. The map is a way to look at the catalogue,
never the only route into a page. The picker's version of that rule: the address fields and the geocoder
suggestions are the keyboard path and the only one that must work, the pin corrects what they produced,
and `position` stays optional — an address nothing could place still saves.

## Commands

```bash
yarn dev            # vite on http://127.0.0.1:3045, GraphQL paths proxied to 4027/4028/4030/4031/4032
yarn codegen        # regenerate src/gql/ from schema/*.graphql — one project per access level
yarn build          # codegen && tsc --noEmit && vite build
yarn start          # node serve.mjs — SSR only, needs PORT set, no default
yarn lint           # eslint --fix + prettier --write   (lint:check for CI and the hooks)
yarn test  test:cov  test:mutation   # gated at 100 / 100
```

⚠️ **`schema/*.graphql` are hand-maintained slices, not the contract.** No service has an SDL file; all
build their schema programmatically → the resolvers are the source of truth and these slices drift.
Re-check against the resolver before adding or changing an operation.

## Language

⚠️ **English only** — identifiers, UI text, routes, comments, fixtures. No exception; adding one word of a
second language is a regression, not a style nit.

The `en-GB` collator ordering categories, the `en-GB` formats in `src/lib/format.ts` and `<html lang="en">`
in `src/routeOptions/root.tsx` are market choices, not names: changing one changes what the page says
about itself to a crawler and what every date and distance looks like.

Git rules — branch first, never commit on `main`, no remote, push-on-request — are the parent's, and apply
here unchanged.

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
