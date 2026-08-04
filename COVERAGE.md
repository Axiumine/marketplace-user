# Coverage and mutation policy

⚠️ **There is no `test/` directory in this repo, so both numbers below describe the target and not the
current state.** The harness is complete — `vitest.config.ts`, `vitest.polyfill.ts`, `stryker.config.mjs`,
`qodana.yaml`, the `test:*` scripts and the git hooks — and the tests are the only missing part, per the
standing instruction to skip them. Until they exist a commit here needs `git commit --no-verify`, which is
a stated exception and not the way to work: **do not lower a threshold and do not remove a gate to make a
commit pass.** Everything below is the shape the first test written should assume.

Two numbers, both 100, both blocking — plus a scan that re-checks the first one and much else:

| Gate | Command | Where the threshold lives |
|---|---|---|
| Coverage — statements, branches, functions, lines | `yarn test:cov` | `vitest.config.ts`, `qodana.yaml` |
| Mutation score | `yarn test:mutation` | `stryker.config.mjs` (`thresholds.break: 100`) |
| Inspections, SAST, SCA, license audit, coverage | `./qodana.sh` | `qodana.yaml` (`failureConditions`) |

All three run in `.githooks/pre-push`, after `yarn lint:check` and `tsc --noEmit`; coverage and Qodana run
again in `.githooks/pre-commit`. The reasons both hooks scan, why `SKIP_TESTS=1` is passed, and why a
backend service's `QODANA_TOKEN` is not interchangeable with this repo's are identical to
`../marketplace-shopowner/COVERAGE.md` — read that file for the long form; nothing here diverges from it.

## What is excluded, and why each exclusion is not a hole

`stryker.config.mjs` and `vitest.config.ts` both exclude the same set. Every entry is generated code or a
framework entry point, and one of them is narrower than it looks:

| Excluded | Why |
|---|---|
| `src/gql/**` | graphql-codegen output. Rewritten by `yarn codegen`; a test asserting its shape tests the generator. |
| `src/routeTree.gen.ts` | Written by the TanStack Start plugin on every dev start and every build. |
| `src/client.tsx`, `src/server.ts`, `src/instrument.ts` | Three-line framework entry points. Nothing branches. |
| `serve.mjs` | The production listener. It reads `PORT`, validates it and calls `serve()`; there is nothing here that a unit test could observe that starting the process would not. |
| `src/routes/**/*.tsx` | One-line `createFileRoute(id)(options)` calls. The `options` constant is the thing with behaviour and it is **not** excluded — see below. |

⚠️ **That last row is `.tsx` only, deliberately, and the glob must stay narrow.** The three **`.ts`** files
in `src/routes/` — `robots[.]txt.ts`, `sitemap[.]xml.ts` and `sitemaps.$kind.$cursor.ts` — are server route
handlers with real bodies: they validate a path parameter, call a loader and set cache headers. A
`'!src/routes/**'` written for the one-liners silently swallows all three, and mutation would report 100
with the sitemap's cursor validation untested.

## Where the behaviour actually lives

The route pattern this app adopted exists for this file. `src/routes/x.tsx` is
`createFileRoute('/x')(xRouteOptions)`; everything testable is the plain constant in `src/routeOptions/`,
which imports nothing from the router and can be exercised without one:

- `loader` — call it with a stub `context.gql`, assert the shape it returns and the `notFound()` /
  `redirect()` it throws. `categoryCommon.tsx` throws a **301**, not the router's default 307, and a test
  that only checks "it redirected" passes for the mutant that makes it a 307.
- `head` — call it with a `loaderData` and assert the emitted tags. The canonical, the `noIndex` on page 2
  and the `rel="prev"`/`rel="next"` pairs are all pure functions of the arguments.
- `validateSearch` — parse a URL search object and assert what comes out. `?page=0`, `?page=abc` and an
  absent `?page=` must all produce page 1; `?near=1,2` and `?near=1,2,3,4` must both be rejected.
- `component` — Testing Library, with the loader data supplied through a `getRouteApi` mock.

## SSR-specific traps a test has to cover

1. **`headFor` output must be asserted as strings, not as presence.** A canonical that renders as a
   relative path is worse than no canonical, and `expect(links).toHaveLength(2)` passes for it.
2. **The client is per request.** `src/api/ssr.ts` builds a new urql client for every SSR render, and a
   test that reuses one across two renders is asserting the bug it exists to prevent — one visitor's
   cached response served to another. Assert that two calls return two different instances.
3. **`toLngLat` returns `undefined` for anything that is not a pair of finite numbers** (`src/lib/geo.ts`).
   The mutants that survive weak tests here are the ones swapping `undefined` for `[0, 0]`, which is a real
   place in the Gulf of Guinea and renders a perfectly convincing map of the wrong thing.
4. **Sitemap shards are cursor-addressed.** `collectShardCursors` must be tested against a stub that stops
   advancing its `nextAfterId`: the `MAX_SHARDS` ceiling is the only thing between that and an infinite
   walk, and it is one `<` away from being wrong.
