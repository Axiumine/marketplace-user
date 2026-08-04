import { createFileRoute } from '@tanstack/react-router'

import { createSsrClient } from '@/api/ssr'
import { fetchShard, isSitemapKind, urlsetXml, xmlResponse } from '@/lib/sitemap'

/**
 * `/sitemaps/:kind/:cursor` — one shard of up to `SHARD_SIZE` URLs.
 *
 * ⚠️ **No `.xml` suffix, on purpose.** A path parameter consumes a whole segment, so
 * `/sitemaps/$kind/$page.xml` would bind `$page` to the string `"7.xml"` and force the handler to strip
 * it back off. The `Content-Type` header is what tells a crawler this is XML; the extension never was.
 *
 * `:cursor` is the ObjectId the shard starts after, or the literal `start` for the first one — see
 * `src/lib/sitemap.ts` for why this is a cursor rather than a page number.
 *
 * An unknown `:kind` is a 404 rather than an empty `<urlset>`. An empty document says "this section
 * exists and is currently bare", which would be a lie about a section that does not exist, and it would
 * make a typo in the index invisible.
 */
export const Route = createFileRoute('/sitemaps/$kind/$cursor')({
	server: {
		handlers: {
			GET: async ({ params }) => {
				if (!isSitemapKind(params.kind)) return new Response('Not found', { status: 404 })

				const shard = await fetchShard(createSsrClient(), params.kind, params.cursor)

				return xmlResponse(urlsetXml(shard.paths))
			}
		}
	}
})
