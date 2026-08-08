# marketplace-user

The customer surface of the Marketplace platform: one application serving both the **public, anonymous,
search-engine-indexed site** and the **private area of a registered customer**.

This document is the strategy record. It states what was adopted, what it costs, what was evaluated
instead, and why each alternative was rejected. It is meant to be read before the first line of code and
re-read whenever someone is tempted to swap one of these pieces out.

---

## 1. What this app is

| | |
|---|---|
| Audience | anyone on the internet (public) · registered customers (private) |
| Tier | `User` — the end customer, the role that will place orders |
| Dev port | `3045` |
| Backends | `4027` public resource · `4028` public authorization · `4031` user authorization · `4032` user resource · `4030` logout |

The platform's roles are **not** a permission field. A role is the collection you authenticate against:
`admin`, `shopOwner`, and now `user`. This app talks to the `user` tier and to the public tier, and to
nothing else.

**A shop is a company.** There is no `shop` collection and there will not be one. The chain is:

```
shopOwner ──idShopOwner──> company ──idCompany──> item
                                    itemCategory (2 levels, platform-owned)
```

A `company` is what a customer sees as a shop: it already carries the address with a required GeoJSON
position, which is what puts it on the map.

**Out of scope, deliberately:** cart, order state, delivery and payment. They have no existing model on
this platform and are a genuine design decision that has not been made. Everything below is arranged so
they attach to this tier later rather than having to be retrofitted into it — but nothing here pretends
they exist. That is also why `item` has no price field: a price with nothing to buy is a guess about a
decision nobody has taken.

---

## 2. Adopted stack

| Layer | Choice |
|---|---|
| Framework | TanStack Start (Vite 8 · React 19 · TanStack Router with SSR) |
| Rendering | SSR for public routes, client-only for the private area |
| Styling | Tailwind 4, same `@theme` tokens as the two existing apps |
| Data | urql + `cacheExchange` + `@urql/exchange-auth`, graphql-codegen `client-preset` |
| Forms | react-hook-form + zod |
| Map | MapLibre GL + Protomaps PMTiles, client-only island |
| Geocoding | on-premises Nominatim (Docker, regional extract) |
| Search | MongoDB `2dsphere` + `text` index |
| Sessions | opaque tokens in Redis, signed httpOnly refresh cookie (unchanged from the rest of the platform) |
| Bot gate | Cloudflare Turnstile |
| HTML caching | nginx `proxy_cache` with `stale-while-revalidate` |

---

## 3. The decisions, one at a time

### 3.1 TanStack Start, not Next.js

**Adopted.** TanStack Start is Vite + React + TanStack Router with server-side rendering and server
functions bolted on. It is, almost exactly, the SSR version of what `marketplace-admin` and
`marketplace-shopowner` already are.

**Pros**

- Nearly every convention in the workspace carries over unchanged: the urql client and its `CTX_*` module
  constants, graphql-codegen `client-preset` with one project per access level, the react-hook-form + zod
  idiom, Tailwind 4 with the shared `@theme` block, the vitest + Stryker + Qodana gate. A developer moving
  between the three apps is reading the same code. The one thing that does not carry over is the route
  tree; see the deviation below.
- The routing model is plain functions and objects, so it can be unit-tested and mutation-tested. This is
  not a nicety here — every repo on this platform is gated at 100% coverage **and** 100% mutation score.
- One toolchain. The workspace is Vite-only today; adding a second bundler means a second set of build
  bugs, a second cache to invalidate, a second thing to upgrade.
- SSR and client rendering are a per-route switch, which is what makes §3.2 possible.

**Cons, stated plainly**

- Smaller ecosystem than Next.js. Fewer blog posts, fewer ready-made recipes, fewer people who have hit
  the bug you are hitting.
- No built-in ISR. Incremental regeneration has to be done with HTTP cache headers and nginx (§3.8). That
  works and is arguably more transparent, but it is a thing to build rather than a thing to enable.
- Younger project. The API surface has moved more in the last two years than Next's has.

**Deviation from the other two apps: routes are files here, not a hand-written tree.** `marketplace-admin`
and `marketplace-shopowner` both declare `createRoute(...)` calls in a single `src/router.tsx` and document
that as a deliberate choice. That is not available in TanStack Start: the `tanstackStart()` Vite plugin
(1.168.x) always runs the router generator over `router.routesDirectory` into `router.generatedRouteTree`,
and the SSR server entry resolves the router through that generated tree. Fighting it would mean
maintaining a hand-written tree that the plugin overwrites on every dev-server start.

What was preserved instead is the property the bullet above actually argues for. Every file under
`src/routes/` is a thin module — an import and a `createFileRoute(...)(options)` call — and the `options`
object it passes lives in `src/routeOptions/`, as a plain exported constant with no framework call in it.
A loader, a head builder, a search-param schema and a component are therefore importable and testable
without mounting a router, which is what the 100/100 mutation gate needs. The cost is one extra file per
route and one generated file (`src/routeTree.gen.ts`) that is excluded from coverage, lint and mutation
like every other generated artefact here.

**Rejected: Next.js App Router.** It has the best-known SEO story and ISR is one export away. It was
rejected on the quality gate, not on features: React Server Components and server actions are hostile to
`vitest` + `@stryker-mutator` — server components are not units you can render in jsdom, and Stryker
mutating a server component produces survivors that mean nothing. Meeting the platform's 100/100 gate
would mean carving out exemptions, and the workspace rule is explicit that a threshold is never lowered.
Secondary reason: Next brings its own bundler into a Vite-only workspace. Note that file-based routing is
*not* among the reasons — the deviation above concedes that point, and it would have been dishonest to
reject Next for a thing the adopted framework also does.

**Rejected: Astro with React islands.** For pure content it is the fastest thing here — zero JS by
default, islands only where needed. It was rejected because the private area is not content: it is an
application with authentication, a refresh-token dance, multi-step forms and optimistic saves. Building it
as islands means either a second framework inside Astro or a second app entirely, and neither is cheaper
than the SSR/CSR split we get for free from one router.

**Rejected: React Router 7 framework mode / Remix.** Technically capable of everything asked. Rejected
because it introduces a fourth routing idiom into a workspace that already speaks TanStack Router in two
apps, and buys nothing over TanStack Start in exchange.

**Rejected: a plain Vite SPA with prerendering.** Cheapest by a wide margin and it is what the other two
apps are. Rejected outright: the catalogue is dynamic and unbounded, so there is no build-time set of
pages to prerender, and a client-rendered catalogue is not reliably indexable.

### 3.2 SSR for public routes, client-only for the private area

**Adopted.** Public routes render on the server. Account routes are marked `ssr: false` and render in the
browser, exactly like the two existing SPAs.

**Pros**

- SEO gets real server HTML with the right `<title>`, canonical, and JSON-LD in the source — not injected
  later by JavaScript.
- Authenticated HTML never touches the server renderer, so it can never end up in an HTTP cache. This
  removes an entire class of cache-poisoning bug rather than mitigating it.
- The refresh-token flow, the in-memory access token and the `onSessionLost` handling are copied verbatim
  from `marketplace-shopowner`. No server-side session handling to invent.
- The server never needs a customer's credentials. Public data needs no authentication at all — the
  public resource service has no auth middleware — so the SSR process holds no secret that matters.

**Cons**

- Two rendering models in one codebase. A developer must know which side of the line a component is on;
  a `window` reference in a public route is a runtime error, not a lint error.
- The first paint of the account area is a spinner. Acceptable: nobody optimises the LCP of a page only
  its owner can see.

**Rejected: SSR everywhere.** Simpler to explain, and it would make the account area feel faster on first
load. Rejected because it means rendering personalised HTML on a shared server sitting behind a cache —
one misconfigured `Cache-Control` and one customer's addresses are served to another. The performance win
does not justify carrying that risk on a 500K-user surface.

**Rejected: CSR everywhere with dynamic rendering for bots.** Serving different HTML to crawlers than to
users is cloaking-adjacent, fragile, and needs a user-agent list nobody maintains.

### 3.3 One urql client per SSR request

**Adopted.** The server creates a fresh urql client for each incoming request and throws it away with the
response.

A module-level client on the server would share its normalised cache across every visitor at once. For
public, anonymous data that looks harmless right up until one query is not as anonymous as assumed. A
per-request client costs an object allocation; the alternative costs a data-leak incident.

### 3.4 MapLibre GL + Protomaps PMTiles

**Adopted.** The map is a client-only island: MapLibre GL rendering vector tiles from a PMTiles archive
served as static bytes by nginx via HTTP range requests. Shop pins come from the backend as GeoJSON,
clustered server-side by a `$geoNear` aggregation.

**Pros**

- **Legality and availability.** `tile.openstreetmap.org` has a usage policy that this traffic class
  violates: it is a donation-funded service, bulk and commercial use are forbidden, and heavy clients get
  blocked. At the stated scale this is not a rate-limit to work around; it is a service that will stop
  answering.
- PMTiles is a single file. There is no tile server process, no tile database, no cache to warm — nginx
  serves byte ranges out of one archive, and it can sit on a CDN unchanged.
- Vector tiles mean client-side styling (dark mode, highlighting a selected shop) with no re-fetch, and
  WebGL rendering that stays smooth with thousands of markers. Raster tiles cannot do either.
- Clustering is native to MapLibre's GeoJSON source, so the "many shops in one city" case is handled
  without inventing anything.

**Cons**

- Bundle weight: MapLibre is roughly 200 KB gzipped. Mitigated by dynamic import — the map is a lazy
  island below the fold, so it never appears in the initial payload of an indexed page.
- WebGL is required. Ancient browsers and some locked-down corporate environments get a static fallback.
- The PMTiles archive has to be built and periodically refreshed. That is a scheduled job, not an
  always-on service, but it is not nothing.

**Rejected: Leaflet + react-leaflet with OSM raster tiles.** The obvious choice and the simplest to
write. Rejected on two counts: it inherits the tile-policy problem above, and raster tiles give no
clustering, no client-side restyling, and visible tile seams while panning.

**Rejected: the static OSM `export/embed.html` iframe** that `marketplace-admin` and
`marketplace-shopowner` both use today. It shows exactly one pin and cannot be interacted with. Correct
for "here is the address you just typed", useless for "here are the shops near you".

**Rejected: Google Maps / Mapbox.** Both solve the problem well and both are metered per map load. At the
stated scale that is a recurring bill for something a static file can do, plus a customer-location data
flow to a third party.

### 3.5 On-premises Nominatim

**Adopted.** A self-hosted Nominatim behind the existing `searchAddresses` seam in `src/lib/nominatim.ts`.
Setup instructions are in [`docs/nominatim/`](docs/nominatim/README.md).

**Pros**

- Open source and free, which was the requirement.
- No rate limit that we do not set ourselves. The public instance allows one request per second — the
  existing address autocomplete already debounces to stay under it, and that ceiling is unreachable with
  customers typing.
- Customer-entered addresses never leave the infrastructure. Address text is personal data, and shipping
  every keystroke to a third party is a GDPR exposure with no upside.
- The client code does not change shape. `src/lib/nominatim.ts` is already provider-shaped: the same
  `jsonv2` response, the same zod validation, the same `FoundAddress` mapping. Only the base URL moves.

**Cons**

- It is a service to run: PostgreSQL with PostGIS, a multi-hour import, disk for the flatnode file, and a
  replication cron if the data should stay current. The doc gives concrete figures.
- Quality is exactly OpenStreetMap's quality. For well-mapped street addresses that is good; for a brand-new
  building it may be missing where a commercial geocoder would have it.

**Rejected: staying on the public Nominatim** (what both existing apps do today). Fine for two internal
panels used by a handful of operators. Against the published usage policy for a public customer-facing
site, and it would be blocked.

**Rejected: Photon.** Lighter and nicer for autocomplete, but it is a search layer over the same data
that still needs importing, and it does not do structured reverse geocoding as well.

**Rejected: any paid geocoder** (Google, Mapbox, HERE, LocationIQ). Metered, and the requirement was
explicitly open source and free.

### 3.6 MongoDB `2dsphere` + `text` first, a search engine later

**Adopted.** Geo queries use a `2dsphere` index on `company.address.position`; full-text uses a MongoDB
`text` index on `company.publicName`/`description` and `item.name`/`description`.

Note that **the `2dsphere` index does not exist yet**. The migration that created `company` says so
outright — nothing on the platform queried companies by distance. Adding it is part of this work, and
without it "shops near me" is a collection scan.

**Pros**

- No new infrastructure, no synchronisation, no second source of truth that can drift from Mongo.
- Geo is genuinely good: `$geoNear` and `$geoWithin` are indexed, accurate, and compose with ordinary
  filters in one aggregation.
- The whole thing lives behind a handful of resolvers, so swapping the implementation later touches those
  resolvers and nothing else.

**Cons, which will eventually bite**

- No typo tolerance. `pizzeira` returns nothing.
- No facets, so a "filter by category and distance while showing counts" UI has to compute counts itself.
- Relevance scoring is a fixed formula. It cannot be tuned, and it cannot be blended with distance.
- Language stemming is per-index and single-language.

**Rejected for now: Meilisearch.** It fixes every one of those cons, is open source, self-hostable and
genuinely small to operate. It was rejected as premature, not as wrong: it is a second datastore to keep
in sync, and the catalogue is currently empty. The seam is deliberately narrow so this swap stays a
one-resolver change. **This is the expected next step once the catalogue and traffic are real.**

**Rejected: OpenSearch/Elasticsearch.** More capable than Meilisearch and considerably more to run — a
JVM, shards, a cluster to size. Out of proportion to the problem.

**Rejected: MongoDB Atlas Search.** Would solve it well, but it is an Atlas feature and this platform runs
its own MongoDB.

### 3.7 Sessions: shared `REDIS_KEY`, a `tier` field, and the shared logout service

**Adopted.** The existing scheme is kept: opaque access and refresh tokens, Redis hashes keyed
`${REDIS_KEY}access:<token>` and `${REDIS_KEY}refresh:<token>`, a Keygrip-signed httpOnly refresh cookie.
The `user` tier joins it with **no new key namespace**, and a `tier` field is added to the session hash.

There is a security defect in the current arrangement that this work fixes rather than inherits.
`authorizationAuthenticatedResourceHandler.mts` reads the session hash by token and, if it is not empty,
accepts the caller. Every one of the seven services carries the same `REDIS_KEY=marketplaceDev:`. So an
`Admin` access token is accepted by the ShopOwner resource service today, and vice versa. Adding a third
tier to that arrangement would let a customer token address shop-owner data.

The fix has three parts, and the third is the one that matters:

1. The login mutations write `tier` (`'admin' | 'shopOwner' | 'user'`) into the session hash; the refresh
   mutations carry it through.
2. Every resource and authorization service asserts its own tier in the auth middleware and returns
   `Forbidden` otherwise.
3. **A session with no `tier` is invalid, not a wildcard.** Sessions minted before the change simply stop
   working and their owners log in again. Treating a missing field as "allow" would keep the hole open for
   the full 90-day refresh-token lifetime, which is the same as not fixing it.

**Pros**

- The assertion is the layer that actually holds. Per-tier key prefixes would also work today and would
  quietly stop working the first time someone copies an `.env` and reuses a prefix.
- `marketplace-dev-authenticated-logout` stays usable **unchanged**. Its resolver deletes
  `${REDIS_KEY}${refreshToken}` and `${REDIS_KEY}${accessToken}` by token content and never inspects which
  model minted them — it is already tier-agnostic, and both existing frontends already point at it.

**Cons**

- Every existing session is invalidated once. One-off, and it is the correct trade against a live
  privilege-escalation path.
- Four existing services have to change in lockstep. In a polyrepo that is four commits and a coordinated
  restart.

**Rejected: a per-tier `REDIS_KEY` prefix.** Looks like isolation and is really a naming convention. It
would also force the shared logout service to know which prefix to delete under, which means three
mutations — `logout`, `logoutAdmin`, `logoutUser` — doing one thing.

**Rejected: a new `marketplace-dev-user-logout` service.** A third process to deploy, monitor and patch,
mirroring a resolver that already works for every tier.

**Rejected: JWTs for the customer tier.** Stateless validation is attractive at 500K users. Rejected
because revocation is the whole point of a session store here — a banned or deleted customer must lose
access immediately, and the rest of the platform already resolves sessions from Redis on every request.
Two auth models in one platform is worse than one.

### 3.8 Caching in nginx, not in the app

**Adopted.** Anonymous HTML is cached by nginx with `stale-while-revalidate`; the cache is bypassed
whenever a session cookie is present. Configs are in [`docs/nginx/`](docs/nginx/).

**Pros**

- The read load — which is nearly all of the load — is answered by nginx from disk. Node renders one
  response per revalidation window, not one per visitor.
- `stale-while-revalidate` means a cache miss never becomes a slow page: the stale copy is served
  immediately while the fresh one is fetched behind it.
- It is framework-independent. If the app framework is ever replaced, the caching layer is untouched.
- The same layer carries TLS, HSTS, CSP, brotli, immutable asset headers and the auth-path rate-limit
  zones, so there is one place to read the edge behaviour from.

**Cons**

- The cache lives outside the code, so "why is this page stale" is answered in a config file that the
  repo does not build or test.
- Purging is coarse. A changed shop page waits out its window rather than being invalidated on write.

**Rejected: in-app ISR-style caching.** Would give precise per-page invalidation. Rejected because it puts
every request through Node to decide it did not need to be there.

**Rejected: a CDN as the only cache.** Worth adding later for static assets and PMTiles. Rejected as the
primary HTML cache because the origin still needs its own protection, and this stack is self-hosted.

### 3.9 Turnstile and rate limiting

**Adopted.** Cloudflare Turnstile on register, login and password reset; a Redis fixed-window limiter on
those three plus the email-verification endpoint.

The platform has **no rate limiting anywhere** today. That is survivable for three internal panels behind
authentication. A public registration mutation and a public search API at this scale need both: Turnstile
stops the cheap automated flood, and the limiter bounds what gets through — including from a human with a
script, which Turnstile does not.

**Pros:** Turnstile is free, needs no puzzle-solving, and does not profile the visitor. The limiter reuses
the Redis cluster that is already there.
**Cons:** a third-party script on the auth pages (and therefore a CSP entry), and a small dependency on
Cloudflare being reachable.

**Rejected: reCAPTCHA** — worse privacy posture, an interaction cost for the customer.
**Rejected: hCaptcha** — comparable, but Turnstile's invisible mode is a better fit for a registration
form we want people to finish.
**Rejected: rate limiting alone** — cheap to defeat with a residential proxy pool.
**Rejected: email-confirmation-only** (no bot gate) — the abuse it permits is sending mail to arbitrary
addresses from our domain, which is how a sending reputation dies.

### 3.10 Login is gated on a verified email

**Adopted.** A customer who has not clicked the confirmation link cannot log in, and the failure is the
same generic message as every other login failure.

`checkUserAuthorizationDisDel` currently gates only `deleted` and `disabled`; both branches carry a
`// fixme: email` comment, so this was always intended and never done. It is added for the `user` tier
only — the `shopOwner` and `admin` behaviour is left exactly as it is, because changing it would lock out
existing accounts that were never asked to verify.

The generic message matters: a distinct "please confirm your email" reply turns the login form into an
account-existence oracle. The whole flow is already built this way — every failure path of the
verification endpoint redirects to the same URL for the same reason.

---

## 4. Data model decisions

### 4.1 `defaultAddress` pointer, not a boolean per address

A customer has several delivery addresses and one of them is the default.

The obvious shape is a `default: true` boolean on each address. **Rejected**, in favour of a single
`defaultAddress` ObjectId at the top of the document pointing at one of `addresses[]._id`.

**Why the pointer wins**

- "At most one default" stops being a rule that has to be *checked* and becomes a shape that **cannot
  express** a second default. There is no state to validate because the invalid state has no
  representation.
- Setting the default is one atomic `$set`. The boolean needs "clear every `default`, then set one",
  which is two writes, which needs a transaction, which still has a window where zero addresses are
  default and a concurrent write can interleave.
- MongoDB cannot enforce "exactly one true in an array" anyway. A unique index does not apply within a
  document, and `$jsonSchema` cannot count. The best available boolean constraint is a `$expr` asserting
  *at most* one — and it has to be *at most*, not *exactly*, precisely because the clear-then-set sequence
  passes through a zero state. So the boolean's own constraint is forced to permit the state it was meant
  to prevent.

**What the pointer can get wrong is dangling — and that is checkable.** A collection validator accepts any
query expression, so the validator is `$and: [ { $jsonSchema: … }, { $expr: … } ]` with:

```js
{ $expr: { $or: [
	{ $eq: [ { $type: '$defaultAddress' }, 'missing' ] },
	{ $in: [ '$defaultAddress', { $map: { input: { $ifNull: ['$addresses', []] }, in: '$$this._id' } } ] }
] } }
```

Absent, or pointing at an address that exists in this document. Nothing else is writable. Deleting the
default address without unsetting the pointer in the same update is rejected **by the database**, not by
an application code path someone can forget to call.

**Cons, honestly**

- "Is this address the default?" is a comparison against a sibling field instead of a local boolean read.
  Trivial in a resolver, slightly noisier in a projection.
- Any API that would have exposed a boolean now derives it.
- It is one more field to keep in step when addresses are edited — which is exactly what the validator
  makes impossible to get wrong.

The trade is one-directional: the pointer can be made safe and the boolean cannot.

### 4.2 `user` mirrors `shopOwner`, with four differences

The builder reuses `account.js` (`LOGIN`, `RESET_PWD`, `DELETED`, `DISABLED`, the unique `login.email`
index), `geo.js` (`address()`, `position()`, `COORDINATE_TUPLE`) and `shopOwner.js`'s `EMAIL_VERIFY`.

| Difference | Reason |
|---|---|
| `personalData` is optional | Registration is email + password + repeat. Everything else is filled in after the email is confirmed. `shopOwner` requires it because a shop owner is onboarded, not self-registered. |
| `addresses` is an array | A customer has several delivery addresses; a shop owner has one. |
| `defaultAddress` exists | §4.1. |
| no `waitApprov` | Customers self-serve. There is no operator approval step, and a field that is always the same value is a field that will eventually be read as if it meant something. |

### 4.3 `item`

The requested shape is `_id`, `idCompany`, `name`, `description`. Four fields were added; each is listed
separately so it can be struck without unpicking the rest:

| Added | Why |
|---|---|
| `idCategory` | Categories were requested. Without the link they cannot filter anything. |
| `slug` | SEO URLs need a stable, readable path segment. Unique per company. |
| `published` | A shop owner must be able to draft an item without it appearing on a public, indexed page. |
| `deleted` | The platform's soft-delete convention — `companyDel` stamps a date rather than removing the row. |

Indexes: `idCompany_list`, unique `{idCompany, slug}`, compound `{idCompany, published}`, and a `text`
index on `name` + `description`.

### 4.4 `itemCategory` — two levels, platform-owned

`_id`, `name`, `slug` (unique), `idParent` (optional, self-referencing), `position` (sort order).

No `idParent` means a top-level category; `idParent` present means a subcategory. **Two levels only.** That
cannot be expressed structurally in a validator — a document has no way to see its parent — so it is
enforced in the resolver: a category whose `idParent` is itself a subcategory is rejected.

Writes exist **only** in the admin resource service. Shop owners and the public read. A self-service
category tree becomes a synonym swamp within a month and takes the facets down with it.

**Rejected: unlimited nesting.** More flexible, and it makes every breadcrumb, every menu and every query
recursive. Two levels covers "Home → Kitchen" and stops.

**Rejected: tags instead of a tree.** Better for search, worse for browsing, and browsing is what the
public pages are for. Tags remain an option later, alongside the tree rather than instead of it.

### 4.5 `company` gains the fields a public page needs

`company` today is a legal entity: `legalName`, `vatNumber` (VAT number), `certifiedEmail` (PEC),
`registryExtract` (visura), and an address with a required position. None of that is a shop listing.

Added: `publicName` (the trading name — `legalName` is a legal instrument and reads wrong on a card),
`slug`, `description`, and `published` (nothing is indexable until the owner says so). Plus the
`2dsphere` index from §3.6.

This touches `lib/schemas/`, so the workspace rule applies: every database that has run these migrations
is rebuilt in the same piece of work.

---

## 5. SEO

- **URLs** — `/`, `/shops`, `/shops/:city`, `/shop/:slug`, `/shop/:slug/item/:itemSlug`,
  `/category/:slug[/:subSlug]`, `/search?q=&near=`. Slugs are immutable by default; a change leaves a 301.
- **Head** — per-route `<title>` and meta description, canonical, `<html lang="it">`, OpenGraph and
  Twitter cards.
- **Structured data** — `Store` per company (with `geo` and `address`), `Product` per item,
  `BreadcrumbList`, `ItemList` on listings, `WebSite` + `SearchAction` on the home page.
- **Sitemaps** — a `sitemap.xml` index plus 50 000-URL shards generated from a dedicated backend query,
  and a `robots.txt`.
- **Core Web Vitals** — LCP is the first card image, loaded with priority; the map has a reserved height
  so it cannot shift layout, and is lazily imported below the fold; fonts are self-hosted with
  `font-display: swap` and preloaded.
- **Images** — the `sharp` + `clamscan` + `graphql-upload` middleware is already mounted in the resource
  services with no resolver behind it. That is the seam item images land on: AVIF/WebP, responsive
  `srcset`, immutable cache headers.

---

## 6. Security summary

Turnstile and a Redis rate limiter on every public auth path · bcrypt with 14 rounds · generic
authentication errors throughout, so no endpoint reveals whether an account exists · Keygrip SHA-512
signed httpOnly refresh cookie, `Secure` in production · Apollo `csrfPrevention: true` and urql
`preferGetMethod: false`, which are load-bearing together · GraphQL depth limit 10 plus a complexity limit
on the public tier · introspection disabled in production · strict CSP and HSTS from nginx ·
`INTROSPECTION_CODE` never reaches a browser — the SSR server calls the public resource service, which
requires no authentication at all · the access token lives in a module-level variable and is never written
to `localStorage` or a readable cookie · the tier assertion of §3.7.

---

## 7. Known costs and open items

- **The suite runs entirely under jsdom, and nothing here is exercised against a real service.** 66 files
  and 1165 tests hold 100% coverage and a 100 mutation score, so every gate passes without `--no-verify` —
  but GraphQL is stubbed at `fetch`, MapLibre is a fake, and the Turnstile script is never fetched. What
  that leaves untested is the wire: a resolver whose answer shape drifted from `schema/*.graphql` passes
  here and fails in the browser, because the slices are hand-maintained and not the contract (§3.6). The
  backend services own that half in their own integration suites; the seam between the two is covered by
  nothing, and an end-to-end run against the five endpoints is the missing layer rather than more units.
- **Route-level code splitting does not happen, and the route pattern is why.** TanStack Start turns
  `autoCodeSplitting` on and does not let a config switch it off — but the splitter works by reading the
  `component` / `loader` properties written literally inside `createFileRoute(...)({ … })`, and every
  route file here is the one-liner `createFileRoute('/x')(xRouteOptions)` that §3.1 adopted for
  testability. The splitter sees an imported identifier, cannot prove what is in it, and leaves it in the
  entry chunk. Measured on the first green build: one client chunk of 623 KB (189 KB gzipped) holding
  React, the router, urql and every page, plus a second of 959 KB (251 KB gzipped) that is MapLibre.
  **The split that matters is the one that survived** — the map is dynamically imported through
  `MapIsland` and never enters the entry chunk, which is where the weight actually was. Getting the rest
  would mean inlining every route's options back into its route file and giving up the plain, importable
  constants; that trade is worth revisiting when a page appears that is heavy on its own, and not before.
- **Meilisearch is the expected next step** for search, once the catalogue is real (§3.6).
- **The PMTiles archive needs a refresh job.** Monthly is fine for shop locations.
- **Orders, cart, delivery and payment are unbuilt** and undesigned. Nothing here assumes their shape.
- **`@thedoctorweb_agency/marketplace-common` is not published to npm.** It is deployed locally into each
  consumer's `node_modules` by a script in that repo, and must be redeployed after every edit.

---

## 8. Related documents

- [`docs/nginx/`](docs/nginx/) — TLS, CSP, the HTML cache, PMTiles range serving, rate-limit zones.
- [`docs/nominatim/README.md`](docs/nominatim/README.md) — on-premises geocoder setup, start to finish.
- `../CLAUDE.md` — the platform-wide conventions this app is bound by.
- `../marketplace-shopowner/README.md` — the app this one borrows its client-side conventions from.
