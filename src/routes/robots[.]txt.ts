import { createFileRoute } from '@tanstack/react-router'

import { absoluteUrl } from '@/lib/seo'

/**
 * `/robots.txt`.
 *
 * Only the private area is disallowed, and it is disallowed because there is nothing there to read: those
 * routes are `ssr: false`, so a crawler receives an empty shell whatever it does.
 *
 * ⚠️ **`/search` is deliberately *not* disallowed, even though every search page is `noindex`.** The two
 * directives do not stack — a URL blocked in `robots.txt` is never fetched, so its `noindex` is never
 * read, and a blocked URL that something else links to can still be indexed URL-only, with no way left to
 * remove it. `noindex` is the directive that actually deletes a page from an index, and it only works on a
 * page the crawler is allowed to fetch. The infinite `?q=` space it exposes is bounded in practice because
 * nothing on this site emits a link to a search result: the search box is a form, and forms are not
 * followed.
 */
const BODY = [
	'User-agent: *',
	'Disallow: /account',
	'Disallow: /login',
	'Disallow: /register',
	'Disallow: /reset-password',
	'',
	`Sitemap: ${absoluteUrl('/sitemap.xml')}`,
	''
].join('\n')

export const Route = createFileRoute('/robots.txt')({
	server: {
		handlers: {
			GET: () =>
				new Response(BODY, {
					headers: {
						'content-type': 'text/plain; charset=utf-8',
						'cache-control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
					}
				})
		}
	}
})
