# nginx — customer surface

Configuration for the host that fronts `marketplace-user`. **No nginx exists in this workspace or on this
development machine** (there is no `/etc/nginx` and no nginx binary in `PATH`) — these files describe the
production edge and are meant to be copied to whatever host actually terminates TLS for the platform.

## What the edge is responsible for

1. TLS termination, HSTS, and a strict Content-Security-Policy.
2. Caching anonymous HTML so that Node renders one response per revalidation window instead of one per
   visitor — with `stale-while-revalidate` semantics, so a miss never becomes a slow page.
3. **Never** caching a response for a logged-in customer.
4. Serving the PMTiles map archive as byte ranges out of a static file.
5. Rate-limiting the four public authentication paths.
6. Proxying the GraphQL endpoints and the email-verification route to their backend services.

## Files

|File|Role|
|---|---|
|`cache.conf`|`http`-level cache zone, the bypass map, and the upstreams|
|`security-headers.conf`|`include`-able header block (HSTS, CSP, frame/type/referrer policy)|
|`rate-limit.conf`|`http`-level `limit_req_zone` definitions|
|`marketplace-user.conf`|the customer vhost itself|

## Install

```bash
# http-level fragments
sudo cp cache.conf rate-limit.conf /etc/nginx/conf.d/
# server-level
sudo cp marketplace-user.conf        /etc/nginx/sites-available/
sudo cp security-headers.conf        /etc/nginx/snippets/
sudo ln -s /etc/nginx/sites-available/marketplace-user.conf /etc/nginx/sites-enabled/

sudo mkdir -p /var/cache/nginx/marketplace-user
sudo chown -R www-data:www-data /var/cache/nginx/marketplace-user

sudo nginx -t && sudo systemctl reload nginx
```

`cache.conf` and `rate-limit.conf` must be included at `http` level — `proxy_cache_path`, `limit_req_zone`,
`map` and `upstream` are not valid inside a `server` block. On Debian, `/etc/nginx/conf.d/*.conf` is already
included from `http` by the stock `nginx.conf`.

## Verifying it works

```bash
# a cold anonymous request, then a warm one
curl -sI https://<customer-domain>/shops | grep -i x-cache-status   # MISS
curl -sI https://<customer-domain>/shops | grep -i x-cache-status   # HIT

# a request carrying a session must never be cached
curl -sI -H 'Cookie: refresh_token=whatever' https://<customer-domain>/shops | grep -i x-cache-status
# BYPASS

# the HTML must contain the metadata, not a JS bundle that will add it later
curl -s https://<customer-domain>/shop/<slug> | grep -E '<title>|rel="canonical"|application/ld\+json'

# the cache is actually absorbing the load
autocannon -c 100 -d 20 https://<customer-domain>/shops
```

If the second request is a `MISS`, the response carried a `Set-Cookie` or a `Cache-Control: private` from
the app — nginx will not store either. That is the app's bug, not the edge's.

## Two things that are easy to get wrong

**`proxy_cache_bypass` and `proxy_cache_no_cache` are different directives and you need both.** The first
skips the *lookup* (this request goes to the origin); the second skips the *store* (this response is not
written to the cache). With only the first, a logged-in customer's personalised HTML is fetched fresh and
then saved for the next anonymous visitor.

**The private area is client-rendered, so it never produces cacheable HTML in the first place.** The bypass
map is the second line of defence, not the first. Do not weaken the app's rendering split on the grounds
that nginx is handling it.
