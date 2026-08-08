import { describe, expect, it } from 'vitest'

import { createSsrClient } from '@/api/ssr'
import type { GraphQlSitemapKind } from '@/gql/publicResource/graphql'
import {
	collectIndexPaths,
	collectShardCursors,
	escapeXml,
	FETCH_LIMIT,
	fetchShard,
	isSitemapKind,
	MAX_SHARDS,
	SHARD_SIZE,
	shardPath,
	SITEMAP_CACHE_CONTROL,
	sitemapIndexXml,
	START_CURSOR,
	urlsetXml,
	xmlResponse
} from '@/lib/sitemap'

import type { GraphQLReply } from '../helpers/graphql'
import { graphQLError, stubGraphQL } from '../helpers/graphql'

const ORIGIN = 'http://127.0.0.1:3045'
const SSR_URL = 'http://127.0.0.1:4027/public-resource'

/**
 * The real SSR client, not a fake `Client`.
 *
 * A hand-rolled object with a `query` method would let these tests pass while `runQuery`'s partial-response
 * rule, urql's operation naming and the `preferGetMethod: false` that keeps every service's CSRF guard
 * happy were all wrong. Stubbing at `fetch` leaves that whole stack real.
 */
const client = () => createSsrClient(SSR_URL)

/** One backend page: `count` paths, and the cursor the next page starts at. */
const page = (count: number, nextAfterId: string | null, prefix = 'p'): GraphQLReply => ({
	data: {
		sitemapEntries: {
			nodes: Array.from({ length: count }, (_unused, index) => ({ path: `/${prefix}${index}` })),
			nextAfterId
		}
	}
})

describe('the constants the shard walk is built on', () => {
	// `FETCH_LIMIT` mirrors `MAX_SITEMAP_LIMIT` in the resolver, which clamps silently rather than
	// erroring — so a limit above it does not fail, it just makes the shard walk take more round trips
	// than it thinks and the arithmetic below stops describing reality.
	it('asks the backend for less than it clamps at, and fills a shard in whole pages', () => {
		expect(FETCH_LIMIT).toBeLessThanOrEqual(SHARD_SIZE)
		expect(SHARD_SIZE).toBeLessThan(50_000)
	})

	/*
	 * ⚠️ 24 hex characters is an ObjectId, so a real `afterId` can never be the literal `start` — which is
	 * what makes the sentinel safe to put in a URL segment beside real cursors.
	 */
	it('uses a sentinel no ObjectId can collide with for the first shard', () => {
		expect(START_CURSOR).toBe('start')
		expect(START_CURSOR).not.toMatch(/^[0-9a-f]{24}$/)
	})
})

describe('isSitemapKind', () => {
	it.each(['COMPANY', 'ITEM', 'CATEGORY'])('accepts %s', (kind) => {
		expect(isSitemapKind(kind)).toBe(true)
	})

	/*
	 * The `:kind` segment is whatever a crawler put in the URL, and it is forwarded into a GraphQL enum
	 * variable. Without this guard an unknown value reaches the resolver and comes back as a 400 the route
	 * renders as a 500, on a URL search engines retry for weeks.
	 */
	it.each(['company', 'Item', 'USER', '', 'ITEM ', 'COMPANY,ITEM'])('rejects %o', (kind) => {
		expect(isSitemapKind(kind)).toBe(false)
	})
})

describe('escapeXml', () => {
	it('escapes all five reserved characters', () => {
		expect(escapeXml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &apos;')
	})

	/*
	 * The ampersand has to be replaced first or the escapes escape each other: `<` → `&lt;` → `&amp;lt;`,
	 * and every entity in the document comes out doubled. Asserting on a string that needs both is the
	 * only way to catch a reordering, since either order passes a single-character test.
	 */
	it('does not double-escape the ampersands its own escapes introduce', () => {
		expect(escapeXml('a<b&c')).toBe('a&lt;b&amp;c')
		expect(escapeXml('&lt;')).toBe('&amp;lt;')
	})

	it('replaces every occurrence, not just the first', () => {
		expect(escapeXml('a&b&c')).toBe('a&amp;b&amp;c')
	})

	it('leaves an ordinary slug alone', () => {
		expect(escapeXml('/shop/rivers-boutique')).toBe('/shop/rivers-boutique')
	})
})

describe('urlsetXml', () => {
	it('writes a declaration, the sitemap namespace and one absolute loc per path', () => {
		expect(urlsetXml(['/shop/a', '/shop/b'])).toBe(
			[
				'<?xml version="1.0" encoding="UTF-8"?>',
				'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
				`\t<url><loc>${ORIGIN}/shop/a</loc></url>`,
				`\t<url><loc>${ORIGIN}/shop/b</loc></url>`,
				'</urlset>',
				''
			].join('\n')
		)
	})

	/*
	 * ⚠️ No `<lastmod>`, and this assertion is the guard on it. `sitemapEntries` answers paths only, so any
	 * timestamp here would be fabricated — and a crawler that learns this site's `lastmod` means nothing
	 * stops trusting the real ones too, on every other site-wide signal it has.
	 */
	it('publishes no lastmod, changefreq or priority', () => {
		const xml = urlsetXml(['/shop/a'])

		expect(xml).not.toContain('lastmod')
		expect(xml).not.toContain('changefreq')
		expect(xml).not.toContain('priority')
	})

	it('escapes a path that carries a reserved character', () => {
		expect(urlsetXml(['/search?q=bags&near=boston'])).toContain(`${ORIGIN}/search?q=bags&amp;near=boston`)
	})

	// A kind with nothing published still gets a document: an empty `<urlset>` says "this section exists
	// and is currently bare", which is the answer that brings a crawler back.
	it('writes a valid empty document for a kind with nothing published', () => {
		expect(urlsetXml([])).toBe(
			[
				'<?xml version="1.0" encoding="UTF-8"?>',
				'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
				'</urlset>',
				''
			].join('\n')
		)
	})

	it('ends with a newline', () => {
		expect(urlsetXml(['/shop/a']).endsWith('</urlset>\n')).toBe(true)
	})
})

describe('sitemapIndexXml', () => {
	// The index uses `<sitemap>` and `<sitemapindex>`; a `<urlset>` of shard URLs parses but tells the
	// crawler the shards themselves are pages to index, and the real URLs are never discovered.
	it('writes sitemap entries rather than url entries', () => {
		expect(sitemapIndexXml(['/sitemaps/ITEM/start'])).toBe(
			[
				'<?xml version="1.0" encoding="UTF-8"?>',
				'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
				`\t<sitemap><loc>${ORIGIN}/sitemaps/ITEM/start</loc></sitemap>`,
				'</sitemapindex>',
				''
			].join('\n')
		)
	})

	it('escapes and writes a valid empty index', () => {
		expect(sitemapIndexXml(['/x?a&b'])).toContain('/x?a&amp;b')
		expect(sitemapIndexXml([])).toContain('<sitemapindex')
	})
})

describe('shardPath', () => {
	it('addresses a shard by kind and cursor', () => {
		expect(shardPath('ITEM', '652f1c9d4e8a7b2c3d1f0a99')).toBe('/sitemaps/ITEM/652f1c9d4e8a7b2c3d1f0a99')
	})

	// The first shard is `/sitemaps/ITEM/start`, never `/sitemaps/ITEM/` — a URL segment cannot be empty,
	// and an empty one would collide with the index route.
	it('addresses the first shard by the sentinel', () => {
		expect(shardPath('COMPANY', START_CURSOR)).toBe('/sitemaps/COMPANY/start')
	})
})

describe('fetchShard', () => {
	it('reads a single page and reports no next shard', async () => {
		stubGraphQL({ SitemapEntries: page(3, null) })

		expect(await fetchShard(client(), 'ITEM', START_CURSOR)).toEqual({ paths: ['/p0', '/p1', '/p2'] })
	})

	/*
	 * ⚠️ `start` is not sent to the backend. Forwarding it as an `afterId` would make the resolver compare
	 * an ObjectId against the string `start`, which is a cast error rather than an empty result — the
	 * first shard of every kind would 400 and the sitemap would have no first page.
	 */
	it('translates the start sentinel into no cursor at all', async () => {
		const stub = stubGraphQL({ SitemapEntries: page(1, null) })
		await fetchShard(client(), 'COMPANY', START_CURSOR)

		expect(stub.calls[0]?.variables).toEqual({ kind: 'COMPANY', limit: FETCH_LIMIT })
		expect('afterId' in (stub.calls[0]?.variables ?? {})).toBe(false)
	})

	it('sends a real cursor through as the afterId', async () => {
		const stub = stubGraphQL({ SitemapEntries: page(1, null) })
		await fetchShard(client(), 'ITEM', '652f1c9d4e8a7b2c3d1f0a99')

		expect(stub.calls[0]?.variables).toEqual({
			kind: 'ITEM',
			afterId: '652f1c9d4e8a7b2c3d1f0a99',
			limit: FETCH_LIMIT
		})
	})

	// POST, because every service sets `csrfPrevention: true` and rejects a GET carrying none of Apollo's
	// preflight-forcing headers — which urql does not send.
	it('posts to the SSR endpoint', async () => {
		const stub = stubGraphQL({ SitemapEntries: page(1, null) })
		await fetchShard(client(), 'ITEM', START_CURSOR)

		expect(stub.calls[0]?.method).toBe('POST')
		expect(stub.calls[0]?.url).toBe(SSR_URL)
	})

	/*
	 * Keyset pagination cannot be parallelised — page N+1's starting point is only known once page N has
	 * answered — so a full shard is a sequence of round trips, each one starting where the last stopped.
	 * A shard that re-sent the same `afterId` would loop on the first 2 000 paths forever.
	 */
	it('walks page after page, each starting where the last one ended', async () => {
		const stub = stubGraphQL({
			SitemapEntries: [page(FETCH_LIMIT, 'a'), page(FETCH_LIMIT, 'b'), page(FETCH_LIMIT, 'c')]
		})
		const shard = await fetchShard(client(), 'ITEM', START_CURSOR)

		expect(stub.calls.map((call) => call.variables.afterId)).toEqual([undefined, 'a', 'b'])
		expect(shard.nextCursor).toBe('c')
	})

	/*
	 * A shard overshoots `SHARD_SIZE` by up to one page, because the loop pushes whole pages and only
	 * then re-checks. Deliberate: splitting a page would mean holding the remainder across the shard
	 * boundary, and the overshoot is 6 000 URLs against a protocol limit of 50 000.
	 */
	it('stops at the first page that reaches the shard size, keeping that page whole', async () => {
		stubGraphQL({ SitemapEntries: [page(FETCH_LIMIT, 'a'), page(FETCH_LIMIT, 'b'), page(FETCH_LIMIT, 'c')] })
		const shard = await fetchShard(client(), 'ITEM', START_CURSOR)

		expect(shard.paths).toHaveLength(3 * FETCH_LIMIT)
		expect(shard.paths.length).toBeGreaterThanOrEqual(SHARD_SIZE)
	})

	/*
	 * ⚠️ **Exactly `SHARD_SIZE` is a full shard, not one path short of one.** The boundary matters because
	 * the loop is written `<` and `<=` is one keystroke away: with `<=`, a shard that landed precisely on
	 * the size would fetch one more page, overshoot by up to `FETCH_LIMIT`, and — since `collectIndexPaths`
	 * derives the next cursor from where the shard stopped — hand the following shard a starting point past
	 * paths this one never emitted. The sitemap would be short by up to 2 000 URLs, silently.
	 *
	 * The counts are derived from the two constants rather than written as `2000, 2000, 1000`, so the test
	 * still sits on the boundary if either is retuned.
	 */
	it('stops the moment the shard is exactly full, without asking for another page', async () => {
		const remainder = SHARD_SIZE - 2 * FETCH_LIMIT
		const stub = stubGraphQL({
			SitemapEntries: [page(FETCH_LIMIT, 'a'), page(FETCH_LIMIT, 'b'), page(remainder, 'c'), page(FETCH_LIMIT, 'd')]
		})
		const shard = await fetchShard(client(), 'ITEM', START_CURSOR)

		expect(shard.paths).toHaveLength(SHARD_SIZE)
		expect(stub.calls).toHaveLength(3)
		// Non-null, so nothing here mistakes "the shard is full" for "the collection has ended".
		expect(shard.nextCursor).toBe('c')
	})

	/*
	 * ⚠️ A null `nextAfterId` ends the *collection*, not the shard, and the distinction is the whole
	 * difference between a correct sitemap and a truncated one: reported as a next cursor it would produce
	 * an extra empty shard forever, and ignored mid-shard it would drop everything after the first page.
	 */
	it('ends the walk on a null nextAfterId even mid-shard', async () => {
		stubGraphQL({ SitemapEntries: [page(FETCH_LIMIT, 'a'), page(7, null, 'q')] })
		const shard = await fetchShard(client(), 'ITEM', START_CURSOR)

		expect(shard.paths).toHaveLength(FETCH_LIMIT + 7)
		expect(shard.nextCursor).toBeUndefined()
	})

	// The resolver's schema makes the field nullable, but a field the wire omits arrives as `undefined`
	// rather than `null` — and `=== null` alone would treat that as a cursor and walk on with `undefined`.
	it('ends the walk on an absent nextAfterId', async () => {
		stubGraphQL({ SitemapEntries: { data: { sitemapEntries: { nodes: [{ path: '/only' }] } } } })

		expect(await fetchShard(client(), 'ITEM', START_CURSOR)).toEqual({ paths: ['/only'] })
	})

	// Through `runQuery`, so a GraphQL error becomes a rejection rather than a shard of `undefined` paths
	// that renders as an empty `<urlset>` — an empty sitemap is indistinguishable from a deleted catalogue.
	it('rejects rather than answering an empty shard when the query fails', async () => {
		stubGraphQL({ SitemapEntries: { errors: [graphQLError('Bad Request', undefined, 400)], status: 400 } })

		await expect(fetchShard(client(), 'ITEM', START_CURSOR)).rejects.toThrow('Bad Request')
	})
})

describe('collectShardCursors', () => {
	/*
	 * Always at least one cursor, even for a kind with nothing published. A missing shard tells a crawler
	 * nothing and gives it no reason to come back; an empty one says the section exists and is bare.
	 */
	it('reports the start cursor for a kind with nothing published', async () => {
		stubGraphQL({ SitemapEntries: page(0, null) })

		expect(await collectShardCursors(client(), 'CATEGORY')).toEqual([START_CURSOR])
	})

	it('reports one cursor per shard, in walk order', async () => {
		stubGraphQL({
			SitemapEntries: [
				page(FETCH_LIMIT, 'a'),
				page(FETCH_LIMIT, 'b'),
				page(FETCH_LIMIT, 'c'),
				page(FETCH_LIMIT, 'd'),
				page(FETCH_LIMIT, 'e'),
				page(FETCH_LIMIT, 'f'),
				page(5, null)
			]
		})

		expect(await collectShardCursors(client(), 'ITEM')).toEqual([START_CURSOR, 'c', 'f'])
	})

	/*
	 * ⚠️ The guard that makes this terminate. A resolver handing back a `nextAfterId` that does not advance
	 * — a bug, or a cursor pointing at a document that was deleted between two requests — walks forever,
	 * and "forever" here means an SSR worker pinned at 100% until the request times out, on a URL crawlers
	 * hit hard. Truncating the sitemap is the cheap failure.
	 *
	 * The cap is an argument precisely so this is provable: at the real 5 000 it would take 15 000 stubbed
	 * round trips and 30 million paths to reach.
	 */
	it('truncates rather than looping when the cursor never advances', async () => {
		const stub = stubGraphQL({ SitemapEntries: page(FETCH_LIMIT, 'stuck') })

		expect(await collectShardCursors(client(), 'ITEM', 3)).toEqual([START_CURSOR, 'stuck', 'stuck'])
		// Two shards walked, three pages each — the cap counts cursors, and the first one is free.
		expect(stub.calls).toHaveLength(6)
	})

	it('caps at MAX_SHARDS by default', () => {
		expect(MAX_SHARDS).toBe(5_000)
	})
})

describe('collectIndexPaths', () => {
	it('lists every kind, company first, each with its own shards', async () => {
		stubGraphQL({ SitemapEntries: page(2, null) })

		expect(await collectIndexPaths(client())).toEqual([
			'/sitemaps/COMPANY/start',
			'/sitemaps/ITEM/start',
			'/sitemaps/CATEGORY/start'
		])
	})

	/*
	 * Sequential on purpose: three concurrent full-collection walks put three long-running cursors on the
	 * database at once, and this response is cached for an hour — so the latency costs nobody, while the
	 * concurrency would cost the one database every other page shares.
	 */
	it('walks the kinds one after another', async () => {
		const stub = stubGraphQL({ SitemapEntries: page(1, null) })
		await collectIndexPaths(client())

		expect(stub.calls.map((call) => call.variables.kind)).toEqual<GraphQlSitemapKind[]>(['COMPANY', 'ITEM', 'CATEGORY'])
	})

	it('carries each kind its own shard cursors', async () => {
		stubGraphQL({
			SitemapEntries: [
				page(FETCH_LIMIT, 'a'),
				page(FETCH_LIMIT, 'b'),
				page(FETCH_LIMIT, 'c'),
				page(1, null),
				page(1, null),
				page(1, null)
			]
		})

		expect(await collectIndexPaths(client())).toEqual([
			'/sitemaps/COMPANY/start',
			'/sitemaps/COMPANY/c',
			'/sitemaps/ITEM/start',
			'/sitemaps/CATEGORY/start'
		])
	})
})

describe('xmlResponse', () => {
	it('answers XML rather than the HTML a bare Response would default to', async () => {
		const response = xmlResponse(urlsetXml(['/shop/a']))

		expect(response.headers.get('content-type')).toBe('application/xml; charset=utf-8')
		expect(await response.text()).toContain('<urlset')
		expect(response.status).toBe(200)
	})

	/*
	 * `s-maxage` with `max-age=0`: the shared cache in front holds it for an hour while a browser never
	 * does, and `stale-while-revalidate` means a crawler arriving during a revalidation gets the slightly
	 * stale document instead of waiting out a full-collection walk.
	 */
	it('lets the shared cache hold it for an hour and serve it stale for a day', () => {
		expect(xmlResponse('<x/>').headers.get('cache-control')).toBe(SITEMAP_CACHE_CONTROL)
		expect(SITEMAP_CACHE_CONTROL).toBe('public, max-age=0, s-maxage=3600, stale-while-revalidate=86400')
	})
})
