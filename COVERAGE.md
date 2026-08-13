# Coverage and mutation policy

**Both numbers below are the current state, not a target.** `test/` holds 66 files and 1165 tests, and
they carry 100% on all four coverage metrics and a 100 mutation score — 2028 mutants killed, 6 timed out,
none survived, out of 2050 generated — so every gate passes on its own and
`git commit --no-verify` is not needed here for any reason. That is the whole point of writing this file
down: **do not lower a threshold and do not remove a gate to make a commit pass** — the numbers only stay
meaningful while nothing has ever been allowed past them.

Two numbers, both 100, both blocking — plus a scan that re-checks the first one and much else:

| Gate | Command | Where the threshold lives |
|---|---|---|
| Coverage — statements, branches, functions, lines | `yarn test:cov` | `vitest.config.ts`, `qodana.yaml` |
| Mutation score | `yarn test:mutation` | `stryker.config.mjs` (`thresholds.break: 100`) |
| Inspections, SAST, license audit, coverage | `./qodana.sh` | `qodana.yaml` (`failureConditions`) |
| Dependency advisories, HIGH and CRITICAL | trivy, in `.githooks/pre-push` | pinned `aquasec/trivy:0.70.0`, no config file |

All three run in `.githooks/pre-push`, after `yarn semgrep:ci`, trivy and then `yarn lint:check` and
`tsc --noEmit`; coverage and Qodana run again in `.githooks/pre-commit`. Semgrep — SAST, rules vendored
under `semgrep/`, pinned image, `--network none` — is push-only like mutation: both need Docker, and push
is the layer that sees the merge commit. Bypass for a Docker outage, never for a finding:
`SKIP_SEMGREP=1 git push`. The reasons both hooks scan, why `SKIP_TESTS=1` is passed, and why a
backend service's `QODANA_TOKEN` is not interchangeable with this repo's are identical to
[`../marketplace-shopowner/COVERAGE.md`](https://github.com/Axiumine/marketplace-shopowner/blob/main/COVERAGE.md) — read that file for the long form; nothing here diverges from it.

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

## How the suite is built, and the four things that cost a day each

**GraphQL is stubbed at `fetch`, never with a mock urql client** — `test/helpers/graphql.ts`. A fake client
answers whatever the test declares and proves nothing about the exchanges the real one runs: the auth
exchange, the document cache and `preferGetMethod: false` are all *between* the component and the wire, and
a mock client is installed on the far side of them. Stubbing `fetch` keeps them in the path. Replies are
keyed by operation name and take `data`, `errors`, `status`, `body`, `pending: true` or `networkError`; an
operation the test did not declare **throws**, so a component that sends an unexpected query fails loudly
instead of hanging on a `undefined`. Each recorded call carries `{ operationName, variables, url,
authorization }` — assert the `url`, because two services expose mutations under the same name (see
`ChangePasswordForm.test.tsx`).

⚠️ **urql's document cache answers an identical query out of memory without touching `fetch`.** A test that
expects a *second* network call must change the variables; asserting `stub.calls` has length 2 after
re-rendering the same query passes only by accident and fails the moment the cache warms differently.

⚠️ **A dead branch cannot be covered and cannot be killed — delete it instead.** Four of the last six gaps
to 100 were unreachable code, not missing tests: three `??` fallbacks in `routeOptions/shop.tsx` behind a
loader that throws `notFound()` before they can fire, and a container-ref guard in `ShopMap.tsx`. Adding
`ignoreStatic` or an `/* c8 ignore */` would have left an unkillable Stryker mutant on each. `ShopMap`'s
guard was made *live* rather than removed — the container moved from a `useRef` to `useState`, so its
arrival is a render and both arms actually run.

⚠️ **v8-to-istanbul mis-attributes an implicit `else` inside an async arrow.** An `if` with a braced body
ending in `return`, placed after an `await`, can report counts `[4, 0]` for a path the test demonstrably
took (`AddressForm.tsx:122` did exactly this). Writing the `else` out explicitly, or using the bare
`if (…) return` plus fall-through that `AddressList.tsx` uses, gives both arms a countable range. Do not
chase this one with more tests — it is the reporter, not the suite.

To find what is left rather than guess at it: `npx vitest run --coverage --coverage.reporter=json`, then
read `coverage/coverage-final.json` — `branchMap`/`b` gives every branch its type, line and path index, so
"line 122 at 95.45%" becomes "`if` path #1, counts `[4, 0]`" without reading the HTML report.
