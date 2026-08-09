import type { Client } from '@urql/core'

import { SitemapEntriesDocument } from '@/api/operations/publicResource/queries'
import { runQuery } from '@/api/run'
import type { GraphQlSitemapKind } from '@/gql/publicResource/graphql'

import { absoluteUrl } from './seo'

/**
 * The sitemap builders, kept out of the route files so they can be tested without a server.
 *
 * ⚠️ **A shard is addressed by a cursor, not by a page number, and that is the whole design.** The
 * backend paginates by keyset (`_id > afterId`) because offsetting into 500K documents degrades
 * quadratically. A `/sitemaps/ITEM/7` URL would have to re-walk shards 1–6 on every request to find
 * where 7 begins, which puts the quadratic cost back — in the one place a crawler hits hardest. With the
 * cursor in the URL (`/sitemaps/ITEM/652f…`) each shard is a fixed number of index seeks no matter how
 * deep it sits.
 *
 * The index page pays for this once: it walks the whole keyset to learn where the boundaries are. That
 * is unavoidable — nothing can list N shards without knowing N — and it is one URL, cached hard by
 * nginx (see marketplace-nginx/conf.d/30-cache.conf in the parent workspace).
 */

/**
 * URLs per shard. The sitemap protocol allows 50 000 and 50 MB; this is far under both on purpose —
 * a shard is one HTTP response held in memory while it is built, and 5 000 short paths is ~250 KB.
 */
export const SHARD_SIZE = 5_000

/** Matches `MAX_SITEMAP_LIMIT` in the `sitemapEntries` resolver. Asking for more is silently clamped. */
export const FETCH_LIMIT = 2_000

/**
 * The first shard has no cursor before it, and a URL segment cannot be empty. `start` is the sentinel:
 * an ObjectId is 24 hex characters, so no real cursor can ever collide with it.
 */
export const START_CURSOR = 'start'

/**
 * Stops a walk that never terminates. At 5 000 URLs a shard this is 25 million URLs — far past anything
 * this platform will hold — so hitting it means the resolver is handing back a `nextAfterId` that does
 * not advance, and truncating the sitemap beats looping until the request times out.
 *
 * Exported, and `collectShardCursors` takes it as an argument, because a guard nothing can reach is a
 * guard nobody knows is broken: driving 5 000 shards through a stub is 15 million stubbed paths, so the
 * only way to prove the walk actually stops is to lower the cap for the test that proves it.
 */
export const MAX_SHARDS = 5_000

const KINDS: readonly GraphQlSitemapKind[] = ['COMPANY', 'ITEM', 'CATEGORY']

export const isSitemapKind = (value: string): value is GraphQlSitemapKind => KINDS.includes(value as GraphQlSitemapKind)

/**
 * Escapes the five characters XML reserves.
 *
 * Slugs are generated server-side and should never contain any of them, but "should never" is not a
 * guarantee, and one stray `&` in one description-derived slug invalidates the entire sitemap for every
 * crawler that reads it — they stop at the parse error rather than skipping the bad entry.
 */
export const escapeXml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;')

/**
 * A `<urlset>` document.
 *
 * No `<lastmod>`, and that is deliberate rather than missing: `sitemapEntries` returns paths only, and a
 * fabricated timestamp — "now", or the crawl time — teaches a crawler that this site's `lastmod` means
 * nothing, after which it ignores the real ones too. Omitting the element says "I do not know", which is
 * true. `<changefreq>` and `<priority>` are left out for the same reason; both are hints major crawlers
 * have stated outright that they ignore.
 */
export const urlsetXml = (paths: readonly string[]): string =>
	[
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...paths.map((path) => `\t<url><loc>${escapeXml(absoluteUrl(path))}</loc></url>`),
		'</urlset>',
		''
	].join('\n')

/** A `<sitemapindex>` document, listing shard URLs. */
export const sitemapIndexXml = (paths: readonly string[]): string =>
	[
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...paths.map((path) => `\t<sitemap><loc>${escapeXml(absoluteUrl(path))}</loc></sitemap>`),
		'</sitemapindex>',
		''
	].join('\n')

export const shardPath = (kind: GraphQlSitemapKind, cursor: string): string => `/sitemaps/${kind}/${cursor}`

interface Shard {
	readonly paths: readonly string[]
	/**
	 * The cursor the next shard starts at, or `undefined` when this was the last one.
	 *
	 * `| undefined` is written out because `exactOptionalPropertyTypes: true` would otherwise reject
	 * `{ paths, nextCursor: afterId }` where `afterId` is `string | undefined` — the shape the loop below
	 * naturally produces.
	 */
	readonly nextCursor?: string | undefined
}

/**
 * Reads one shard: as many backend pages as it takes to reach `SHARD_SIZE`, starting from `cursor`.
 *
 * Sequential rather than parallel, because keyset pagination has no way to know page N+1's starting
 * point until page N has answered. That is the price of not using an offset, and it is the right trade:
 * three round trips at a fixed cost beats one round trip whose cost grows with how deep it reaches.
 */
export const fetchShard = async (client: Client, kind: GraphQlSitemapKind, cursor: string): Promise<Shard> => {
	const paths: string[] = []
	let afterId: string | undefined = cursor === START_CURSOR ? undefined : cursor

	while (paths.length < SHARD_SIZE) {
		const data = await runQuery(client, SitemapEntriesDocument, { kind, afterId, limit: FETCH_LIMIT })
		const page = data.sitemapEntries

		paths.push(...page.nodes.map((node) => node.path))

		// A null `nextAfterId` is the end of the collection, not the end of this shard.
		if (page.nextAfterId === null || page.nextAfterId === undefined) return { paths }

		afterId = page.nextAfterId
	}

	return { paths, nextCursor: afterId }
}

/**
 * Walks a whole kind and reports the cursor each shard begins at.
 *
 * Always returns at least one entry, so a kind with nothing published still appears in the index as an
 * empty `<urlset>`. A crawler reading an empty shard learns that the section exists and is currently
 * bare; a missing shard tells it nothing, and it has no reason to come back and check.
 */
export const collectShardCursors = async (
	client: Client,
	kind: GraphQlSitemapKind,
	maxShards: number = MAX_SHARDS
): Promise<readonly string[]> => {
	const cursors: string[] = [START_CURSOR]
	let cursor: string | undefined = START_CURSOR

	while (cursors.length < maxShards) {
		const shard: Shard = await fetchShard(client, kind, cursor)
		if (shard.nextCursor === undefined) return cursors

		cursor = shard.nextCursor
		cursors.push(cursor)
	}

	return cursors
}

/** Every shard URL across every kind, in the order the index lists them. */
export const collectIndexPaths = async (client: Client): Promise<readonly string[]> => {
	const paths: string[] = []

	// Sequential on purpose: three concurrent full-collection walks would put three long-running cursors
	// on the database at once, and this response is cached for an hour. Latency here costs nobody.
	for (const kind of KINDS) {
		const cursors = await collectShardCursors(client, kind)
		paths.push(...cursors.map((cursor) => shardPath(kind, cursor)))
	}

	return paths
}

/**
 * `Cache-Control` for a sitemap document.
 *
 * An hour of shared-cache freshness with a day of `stale-while-revalidate`: a crawler that arrives
 * during a revalidation gets the slightly stale document immediately rather than waiting out a
 * full-collection walk, and the walk happens once an hour at most however many crawlers are reading.
 */
export const SITEMAP_CACHE_CONTROL = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'

export const xmlResponse = (body: string): Response =>
	new Response(body, {
		headers: {
			'content-type': 'application/xml; charset=utf-8',
			'cache-control': SITEMAP_CACHE_CONTROL
		}
	})
