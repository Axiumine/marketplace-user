import { createFileRoute } from '@tanstack/react-router'

import { createSsrClient } from '@/api/ssr'
import { collectIndexPaths, sitemapIndexXml, xmlResponse } from '@/lib/sitemap'

/**
 * `/sitemap.xml` — the index, listing every shard of every kind.
 *
 * ⚠️ **The `[.]` in the filename is not a typo.** The route generator splits a filename on `.` to build
 * nested segments, and escapes a literal dot as `[.]` — `sitemap.xml.ts` would produce the route
 * `/sitemap/xml`, which is not a URL any crawler asks for.
 *
 * This is a server route with no component: it answers a `Response` directly and never enters React.
 * Rendering XML through the SSR pipeline would wrap it in the document shell, which is exactly the
 * failure mode where a sitemap comes back as HTML and every crawler silently discards it.
 */
export const Route = createFileRoute('/sitemap.xml')({
	server: {
		handlers: {
			GET: async () => xmlResponse(sitemapIndexXml(await collectIndexPaths(createSsrClient())))
		}
	}
})
