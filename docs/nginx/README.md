# nginx — moved

The nginx configuration that used to live here is gone. It now lives in the **parent workspace**, one
level above every repo:

```
fullstack-marketplace-blueprint/nginx/
```

Read `nginx/README.md` there. Nothing in this repo needs to be edited to change the edge.

## Why it moved

This folder held four files — `marketplace-user.conf`, `cache.conf`, `rate-limit.conf`,
`security-headers.conf` — describing the edge in front of the customer surface only. That was already
the wrong shape: the platform terminates TLS for **three** hostnames, and two of them
(`shopowner.marketplace-domain.com`, `admin.marketplace-domain.com`) had no vhost anywhere. A config
kept inside one of the three frontends' repos cannot describe the other two without lying about where
it belongs.

It also could not be tested from here. The workspace copy ships `nginx/test/`, a container that runs
`nginx -t` over the real files and then drives ~150 assertions through a live nginx against stand-in
backends. That needs every vhost, every snippet and every `conf.d` fragment in one tree.

## What was wrong with the files that were deleted

Two defects, both of which the test container catches and neither of which is visible by reading:

1. **The CSP was never sent.** `security-headers.conf` wrote the policy as
   `add_header Content-Security-Policy "\` followed by one directive per line. nginx has no
   backslash line-continuation inside a quoted string — the backslash-newline became a literal LF in
   the header value, and nginx dropped the whole header silently. Every sibling header in the same
   file arrived normally, so the file looked like it worked. The workspace copy keeps the value on one
   line and the directive list in a comment above it.

2. **`proxy_cache_no_cache` is not an nginx directive.** The README here named it (the real one is
   `proxy_no_cache`) while `cache.conf` used the correct spelling, so the prose and the config
   disagreed about which of the two cache controls existed.

## If you followed a line-number citation here

Several documents under `docs/devprotocol/` in the parent workspace quote these files by path and line
— `SECURITY_AUTH.md`, `INFRA.md`, `RISK_REGISTER.md`, `ADR-019`, `CONSTRAINTS.md`. Those are dated
audit records and describe the tree as it stood when they were written; they have not been rewritten,
because falsifying an audit record to match a later change is worse than a dangling line number. Read
them as history and take `nginx/` in the parent workspace as the current state.

`git log --follow` on the deleted paths in this repo still reaches the full content if you need it.
