# Semgrep — marketplace-user

Static analysis (SAST) for this app. Runs via the pinned Docker image, with
**all rules vendored locally** — no network fetch at scan time, fully
reproducible.

## Run

```bash
yarn semgrep        # human-readable report
yarn semgrep:ci     # nonzero exit on findings + SARIF (semgrep.sarif)
```

Both wrap `docker run … semgrep/semgrep:1.172.0 …` — nothing to install locally.
Output is written as your own UID (`-u`), so no root-owned files. `--network none`
is what makes "vendored" mean something: the container cannot reach the registry
even if a config line asks it to.

## Layout

| Path | What |
|---|---|
| `custom.yml` | Marketplace frontend rules — see below |
| `vendor/typescript.yml` | Vendored registry pack `p/typescript` (74 rules) |
| `vendor/secrets.yml` | Vendored registry pack `p/secrets` (52 rules) |
| `vendor/refresh.sh` | Re-download the vendored packs (manual snapshot update) |

The yarn scripts pass `--config semgrep/`, which loads every rule file in this
directory (custom + vendored) in one shot.

## The custom rules

| Rule | Why it exists |
|---|---|
| `marketplace-fe-no-log-auth-token` | Opaque session tokens. A browser console line reaches session replay and every reporter that scrapes console output. |
| `marketplace-fe-prefer-get-method-must-stay-false` | urql defaults this to `true`; every service sets Apollo's `csrfPrevention: true`, which rejects a GET carrying none of its preflight-forcing headers. The symptom is that short queries fail and mutations work — which reads as a server bug. |
| `marketplace-fe-no-secret-in-vite-env` | `VITE_`-prefixed values are substituted into the client bundle at build time. A secret named that way is published, not read. `VITE_TURNSTILE_SITE_KEY` is exempt — a Turnstile *site* key is public by design. |
| `marketplace-fe-urql-context-must-be-a-module-constant` | urql compares `context` by reference, so a `{ url }` literal built during render re-executes the query forever. WARNING rather than ERROR: the pattern cannot see through a helper, so a legitimate memoised object would trip it. |

| `marketplace-user-public-resource-url-is-server-only` | `PUBLIC_RESOURCE_URL` is deliberately un-prefixed: the SSR server reads it from the process environment and it points at a loopback upstream. Read through `import.meta.env` it would be inlined into the client bundle — a dead endpoint for the browser and an internal address for everyone else. |
| `marketplace-user-account-routes-must-not-ssr` | The account area is `ssr: false` as a security boundary, not a performance choice. Authenticated HTML rendered on a server behind a shared `proxy_cache` is one cache key away from another customer; the cookie-based cache bypass is the other half of the same mechanism. |

## Provenance / reproducibility

- Vendored from `https://semgrep.dev/c/p/<pack>` on **2026-08-01**, the same
  snapshot the eleven backend repos carry.
- Semgrep engine pinned to **`semgrep/semgrep:1.172.0`**.
- The committed YAML is a frozen snapshot — the registry can change server-side,
  so scans use these files, not the live registry. To update deliberately:
  `./vendor/refresh.sh`, then review `git diff` and commit.
- ⚠️ `vendor/secrets.yml` carries **one deliberate edit** from the registry copy, re-applied by
  `refresh.sh` on every fetch. The `detected-slack-webhook` rule ships the canonical Slack
  documentation webhook as a literal `pattern-not:`, and GitHub push protection cannot tell that
  placeholder from a live credential — it blocked the first push of every repo carrying this pack,
  once per repo. It is rewritten as the equivalent `pattern-not-regex`: the same one URL excluded,
  the same webhooks detected. A `git diff` against a fresh registry pull shows that line, and only
  that line.
- `p/javascript` and `p/nodejs` are **not** vendored: the former has the same
  rule-id set as `p/typescript`, the latter is a strict subset of it. Vendoring
  them would only add duplicates (semgrep dedupes by id).

## Scope

⚠️ **`src` only, and that is the whole scope.** The scan walks the directory, so
`.semgrepignore` applies and a new file under `src/` is covered automatically —
but config files at the repo root, `vite.config.ts`, the hooks and anything under
`test/` are **not scanned**. Widening the scope is a one-word edit to the yarn
scripts; leaving it narrow is deliberate, because a rule about secrets reaching a
browser has nothing to say about a test fixture that fakes one.

Unlike the backend services, no `--scan-unknown-extensions` bypass is needed
here: semgrep recognises `.ts` and `.tsx` natively. That flag exists over there
because the services are written in `.mts`, which maps to no parser at all.

⚠️ **Semgrep only scans files git already tracks.** A brand-new source file is
invisible to the scan until it is staged or committed — `Scan was limited to
files tracked by git` is printed on every run and is easy to read past. Stage
first, then scan, or the clean result is about the previous state of the tree.
