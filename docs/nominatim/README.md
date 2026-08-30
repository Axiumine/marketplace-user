# Nominatim — on-premises geocoder

Free, open source, self-hosted. Replaces `nominatim.openstreetmap.org`, which the two existing admin panels
call today and which **cannot** be used by the customer app.

## Why this is not optional

`https://nominatim.openstreetmap.org` runs on donated hardware under a [usage policy](https://operations.osmfoundation.org/policies/nominatim/)
that is a hard rule, not advice:

- **at most 1 request per second**, globally, per application — not per user
- **no bulk geocoding**
- no heavy use of an autocomplete-style UI
- an identifiable `Referer` or `User-Agent`, and a working contact address

500K registered customers typing addresses into a form is precisely the traffic class that policy forbids.
The consequence of ignoring it is a block at the OSMF edge, not a slow response — and the block lands on the
whole platform, including the two internal panels that were using it legitimately.

Self-hosting removes the limit entirely, removes the third-party data leak (today every address an admin
types is sent to a server we do not run), and removes the network hop: a local query answers in single-digit
milliseconds instead of 200–800 ms.

## What it costs

Figures below are for a **single-country extract** the size of the US Northeast. Treat them as the sizing to provision against, then measure —
they move with the OSM data, which grows monotonically.

|Resource|Import|Steady state|
|---|---|---|
|RAM|16 GB minimum, 32 GB comfortable|8 GB|
|Disk|~150 GB free (PostgreSQL builds and then drops intermediate tables)|~60–80 GB|
|CPU|8 cores useful; the import parallelises|2 cores|
|Time|2–4 h on NVMe, 12 h+ on spinning disk|—|

Disk **must** be SSD/NVMe. An import on a rotational disk does not take twice as long, it takes an order of
magnitude longer, and this is the single most common reason a Nominatim import is reported as "hung".

### The flatnode file: skip it here

Every guide mentions `NOMINATIM_FLATNODE_FILE`, and for a **planet** import it is mandatory — an 8-byte slot
per OSM node id, sized by the *global* id space and therefore ~90 GB regardless of how small the extract is.
For a single-country extract it buys little and costs that same 90 GB, because node ids are global and the
file is indexed by id, not by how many of them the extract contains.

**Do not enable it for a single-country extract.** Enable it only if the extract is later widened to a
continent or the planet, and
budget the full 90 GB when you do.

## Install

`mediagis/nominatim-docker` 4.5 — the maintained image, one container, PostgreSQL + PostGIS inside it.

```bash
sudo mkdir -p /srv/nominatim
cd /srv/nominatim
```

`docker-compose.yml`:

```yaml
services:
  nominatim:
    image: mediagis/nominatim:4.5
    container_name: nominatim
    restart: unless-stopped
    ports:
      # Loopback only. nginx is the sole way in — see the parent workspace’s
      # marketplace-nginx/sites-available/marketplace-domain.com.conf.
      - "127.0.0.1:8080:8080"
    environment:
      PBF_URL: https://download.geofabrik.de/north-america/us-northeast-latest.osm.pbf
      # Must be the *-updates URL matching the extract above, or replication silently
      # applies planet diffs to a country database and the import rots.
      REPLICATION_URL: https://download.geofabrik.de/north-america/us-northeast-updates/
      REPLICATION_UPDATE_INTERVAL: 86400
      REPLICATION_RECHECK_INTERVAL: 900
      IMPORT_WIKIPEDIA: "false"
      IMPORT_US_POSTCODES: "false"
      IMPORT_GB_POSTCODES: "false"
      # Read from the host environment; never written into this file.
      NOMINATIM_PASSWORD: ${NOMINATIM_PASSWORD:?set NOMINATIM_PASSWORD in the shell}
      THREADS: 8
    volumes:
      - nominatim-data:/var/lib/postgresql/16/main
    shm_size: 2gb          # PostgreSQL parallel workers; too small = "could not resize shared memory"

volumes:
  nominatim-data:
```

```bash
export NOMINATIM_PASSWORD='<generate one, do not reuse a platform password>'
docker compose up -d
docker compose logs -f nominatim      # the import runs on first boot and takes hours
```

The import is finished when the log reaches `Database version: 4.5.x` and:

```bash
curl -s 'http://127.0.0.1:8080/status?format=json'
# {"status":0,"message":"OK","data_updated":"..."}
```

### Two flags worth knowing

- `IMPORT_WIKIPEDIA: "true"` improves result *ranking* (importance scores) and adds ~30 min and several GB.
  Turn it on if suggestion ordering is judged poor in practice; it changes nothing about which addresses are
  found.
- `FREEZE: "true"` drops the update tables and shrinks the database by roughly a third — and permanently
  disables replication. Only for a deployment that will be re-imported from scratch instead of updated. **Not
  set here**, because we want daily diffs.

## PostgreSQL tuning

The image tunes for import automatically and then relaxes. If tuning by hand (a native install, or an image
override), the split is:

|Setting|During import|Steady state|
|---|---|---|
|`shared_buffers`|2 GB|2 GB|
|`maintenance_work_mem`|10 GB|256 MB|
|`work_mem`|50 MB|50 MB|
|`effective_cache_size`|24 GB|24 GB|
|`autovacuum`|`off`|`on`|
|`fsync`|`off`|**`on`**|
|`full_page_writes`|`off`|**`on`**|
|`max_wal_size`|10 GB|1 GB|
|`checkpoint_timeout`|10min|5min|
|`random_page_cost`|1.1 (SSD)|1.1 (SSD)|

⚠️ **`fsync = off` and `full_page_writes = off` are import-only.** They make the database unrecoverable from a
power loss — acceptable while the only thing at stake is a re-import, unacceptable afterwards. Verify both are
back on before the service takes traffic:

```bash
docker exec nominatim psql -U nominatim -d nominatim -c 'SHOW fsync; SHOW full_page_writes;'
```

## Keeping the data current

The image runs replication itself when `REPLICATION_URL` is set — daily, per
`REPLICATION_UPDATE_INTERVAL`. Nothing to schedule. Check it is actually advancing:

```bash
curl -s 'http://127.0.0.1:8080/status?format=json' | jq .data_updated
```

If `data_updated` stops moving, replication has stalled — almost always because the `*-updates` URL does not
match the extract, or because a diff arrived while the previous one was still applying. Restart the container
and re-check; a stalled replication is silent otherwise, and the geocoder keeps answering with stale data.

Re-import from scratch when: the extract's coverage widens (one region → a continent), or a Nominatim major version
bumps its schema. A re-import is `docker compose down -v && docker compose up -d` and the same hours again, so
do it deliberately.

## The reverse proxy

The browser must never reach Nominatim directly. The parent workspace’s
`marketplace-nginx/sites-available/marketplace-domain.com.conf` already carries the block:

```nginx
location /geocode/ {
    limit_req zone=mkt_geocode burst=20 nodelay;
    proxy_pass http://mkt_nominatim/;
    proxy_cache       mkt_user_html;
    proxy_cache_valid 200 1h;
    proxy_cache_key   "$scheme$request_method$host$request_uri";
    add_header X-Cache-Status $upstream_cache_status always;
    include snippets/security-headers-public.conf;
}
```

Three things it does that matter:

1. **The trailing slash on `proxy_pass`** strips `/geocode` before forwarding, so `/geocode/search?q=…` reaches
   Nominatim as `/search?q=…`. Remove it and every request 404s.
2. **One hour of caching.** Address autocomplete is enormously repetitive — a city name is typed by thousands
   of people, prefix by prefix. This is the cheapest performance win in the whole geocoding path.
3. **A rate limit anyway.** Not because Nominatim has a policy any more, but because a client with a broken
   debounce would otherwise saturate a database that is also serving everyone else.

The admin and shop-owner panels reach the same instance through their own vhosts; add an identical
`location /geocode/` block to each. In development, Vite proxies it — see below.

## Repointing the two existing apps

`src/lib/nominatim.ts` is duplicated, byte for byte, in `marketplace-admin` and `marketplace-shopowner`. Both
need the same edit; a fix to one belongs in the other, as everywhere else in this workspace.

**Today** (`marketplace-admin/src/lib/nominatim.ts:17`):

```ts
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'
```

**After:**

```ts
/**
 * The geocoder is our own Nominatim instance, reached through the reverse proxy rather than by origin:
 * the browser knows the path `/geocode`, and nginx alone knows the host and port. Same-origin also
 * means no CORS preflight on a request that is on the typing path.
 *
 * The env var is an escape hatch for pointing a dev build at a shared instance; it defaults to the
 * proxy path, so nothing has to be configured for the normal case.
 */
const GEOCODER_BASE = import.meta.env.VITE_GEOCODER_URL ?? '/geocode'
const NOMINATIM_SEARCH = `${GEOCODER_BASE}/search`
```

Two edits travel with it, and skipping them leaves the file lying about its own constraints:

1. **The module doc comment (lines 3–16) documents a policy that no longer applies.** "one request per second,
   no bulk querying, and an identifiable client" describes the public instance. Rewrite it to say the instance
   is ours, that the `Referer`-based identification paragraph is obsolete, and that the debounce now exists for
   the *user's* sake (not typing a query per keystroke) rather than to stay inside someone else's quota.
2. **`SEARCH_DEBOUNCE_MS` in `AddressField` can drop** — it was sized by the 1 req/s policy. 150–200 ms is a
   UX number now, not a compliance one. Lower it deliberately, in the same commit, or leave it and say why.

Dev server proxy, in each app's `vite.config.ts`, alongside the existing GraphQL entries:

```ts
'/geocode': {
    target: 'http://127.0.0.1:8080',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/geocode/, '')
}
```

### `urlMap` stays on openstreetmap.org — and only in these two apps

`urlMap` builds an `openstreetmap.org/export/embed.html` iframe. That is a *tile* dependency, not a geocoding
one, and it is untouched by this work: two internal panels rendering one static map each is exactly the low
volume the OSM tile policy permits.

**`marketplace-user` does not use it.** The customer map is MapLibre GL over a self-hosted PMTiles archive,
for the same reason the geocoder moved in-house: `tile.openstreetmap.org` forbids that traffic class outright.
See the map section of [`marketplace-user/README.md`](../../README.md).

## Verifying

```bash
# up, and how fresh
curl -s 'http://127.0.0.1:8080/status?format=json' | jq

# the query the address field actually sends
curl -s 'http://127.0.0.1:8080/search?q=350+Fifth+Avenue+New+York&format=jsonv2&addressdetails=1&limit=5&countrycodes=us&accept-language=en' | jq '.[0]'

# the province code the form reads must be present, and must be `US-XX`
curl -s 'http://127.0.0.1:8080/search?q=New+York&format=jsonv2&addressdetails=1&limit=1&countrycodes=us' \
  | jq '.[0].address["ISO3166-2-lvl6"]'

# through the proxy, twice — MISS then HIT
curl -sI 'https://<customer-domain>/geocode/search?q=New+York&format=jsonv2' | grep -i x-cache-status
curl -sI 'https://<customer-domain>/geocode/search?q=New+York&format=jsonv2' | grep -i x-cache-status
```

The third command is the one that decides whether the migration is complete: `src/lib/nominatim.ts` reads the
province from `ISO3166-2-lvl6` and nothing else, so if that key is absent from the local instance's answer the
address form silently produces empty provinces. It is present on a standard import — this checks the import
was standard.

## Costs and honest limits

- **An import is hours, and a botched one is hours again.** Provision the disk before starting, not after
  PostgreSQL fills it at 80%.
- **Data is only as fresh as the diffs.** A shop at a brand-new address may not geocode until the OSM edit
  reaches the extract. The public instance has the same property; nobody notices because nobody watches it.
- **One country only.** A customer entering a foreign address gets nothing. The two panels are already
  restricted to `countrycodes=us` and every field around them is a US address, so this narrows nothing that
  was open —
  but it is a real ceiling on where the platform can operate without a re-import.
- **One instance is a single point of failure** for address entry. It degrades a form, not the platform: an
  address can still be typed by hand, and the map still renders because tiles come from PMTiles, not from here.
