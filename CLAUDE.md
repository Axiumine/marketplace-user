# marketplace-user

Customer app, `User` tier. Public indexed site **and** private account area, one codebase.

**Read parent first** — [`../CLAUDE.md`](https://github.com/Axiumine/fullstack-marketplace-blueprint/blob/main/CLAUDE.md)
One of fifteen sub-repos; almost nothing here is changeable on its own.

| Need | File |
|---|---|
| strategy, every rejected alternative, chunk numbers | [`README.md`](./README.md) |
| route/endpoint tables, "things that bite", maps architecture, commands, full rationale | [`REPO.md`](./REPO.md) |
| gate policy | [`COVERAGE.md`](./COVERAGE.md) |
| GitNexus rules, registry name | [`AGENTS.md`](./AGENTS.md) |
| anything cross-repo | parent `CLAUDE.md` |

⚠️ **Only server-rendered app on the platform.** Other two frontends are SPAs. Anything that reads as
ceremony below is there because a request renders on a shared Node process before any browser exists.

## Hard rules

- ⚠️ **Never run the mutation gate by hand.** `yarn test:mutation` / `stryker` is **hook-only** — only
  `pre-push` runs it, threshold stays 100. To reproduce a survivor, apply the mutant by hand in the
  source and run `yarn test` instead. Full rationale:
  [`REPO.md`](./REPO.md#mutation-gate-why-its-hook-only-and-how-to-reproduce-a-survivor).
- ⚠️ **`ssr: false` is exactly two routes** — `/account/*` and `/reset-password/confirm`. Every other
  route here, including `/login`, `/register*` and `/reset-password`, is SSR. See
  [`REPO.md`](./REPO.md#routes) for the full table.
- ⚠️ **Never turn SSR on for an `/account` route.** Rendering authenticated HTML behind a shared
  `proxy_cache` is how one customer's data ends up in another customer's response; the cache bypasses on
  the session cookie, so the two rules are one mechanism.
- ⚠️ **The password-reset credential lives only in the URL fragment**, never a path parameter — a
  fragment never reaches a request line, log, `Referer` or cache key. See
  [`REPO.md`](./REPO.md#routes) for the three things that hold this up.
- ⚠️ **`/register` and `/register/seller` write two different collections** (`user` vs. `shopOwner`) and
  both report success regardless — pointing a form at the wrong mutation silently creates the wrong kind
  of account. `/login` here only ever authenticates `user`; the seller page carries no sign-in link.
- ⚠️ **`/privacy` states retention/admin-visibility facts that live in *other* repos.** Changing those
  facts without updating this page turns it into a false statement; tests quote the page word for word.
  Details: [`REPO.md`](./REPO.md#routes).
- ⚠️ **`/authenticated-*` (4026/4029) is the ShopOwner tier** — pointing user-tier code at it fails
  closed on the session's `tier` field. `/logout` (4030) is shared by all three tiers on purpose.
- ⚠️ **`schema/*.graphql` are hand-maintained slices, not the contract.** No service ships an SDL file;
  resolvers are the source of truth and these slices drift — recheck against the resolver.
- ⚠️ **English only** — identifiers, UI text, routes, comments, fixtures, no exception. `en-GB`
  formatting/locale choices are not names and may still vary; see
  [`REPO.md`](./REPO.md#language--market-choices-not-names).
- Git rules — branch first, never commit on `main`, no remote, push-on-request — are the parent's and
  apply here unchanged.

## GitNexus

Run `impact({target, repo})` before editing a symbol and `detect_changes()` before committing —
`repo:` is mandatory and must be a `marketplace*` registry name. Full GitNexus rules, resources and CLI
skill map: [`AGENTS.md`](./AGENTS.md) (registry name **marketplace-user**).
