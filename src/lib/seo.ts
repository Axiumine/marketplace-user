import { env } from '@/env'

/**
 * The `<head>` of every public page, built as plain data.
 *
 * Nothing here imports the router. A head is an array of tag descriptors, so it can be asserted on
 * directly — `expect(headFor(...).links).toContainEqual({ rel: 'canonical', href: '…' })` — instead of
 * rendering a route and reading `document.head`, which under jsdom lags a render behind. That is the
 * whole reason `src/routeOptions/` exists; see README §3.1.
 *
 * ⚠️ These tags only do their job if they are in the **server's** HTML. A crawler that has to run
 * JavaScript to find a canonical link will often not bother, and the ones that do treat it as a weaker
 * signal. This is why the public routes are server-rendered and why `curl | grep '<title>'` is a
 * verification step rather than a nicety.
 */

export interface MetaTag {
	readonly title?: string
	readonly name?: string
	readonly property?: string
	readonly content?: string
}

export interface LinkTag {
	readonly rel: string
	readonly href: string
	readonly hrefLang?: string
}

/**
 * ⚠️ The two arrays are **mutable**, and that is not an oversight. A `head()` return value is handed
 * straight to the router's `UpdatableRouteOptions`, whose `meta` and `links` are declared as plain
 * mutable arrays — and TypeScript refuses `readonly T[]` where `T[]` is expected, since the target could
 * legally push into it. Marking them `readonly` here therefore breaks *every* `createFileRoute(...)`
 * call in `src/routes/`, with an error that names `DetailedHTMLProps<LinkHTMLAttributes<…>>` and never
 * mentions this file.
 *
 * The elements stay `readonly` (see `MetaTag` / `LinkTag`), which is where the protection actually
 * matters: nothing can rewrite a tag in place. Only the array spine is assignable, and the router does
 * not mutate it.
 */
export interface HeadContent {
	readonly meta: MetaTag[]
	readonly links: LinkTag[]
}

export interface SeoInput {
	readonly title: string
	readonly description: string
	/** Site-root-relative, always starting with `/`. Made absolute against `siteUrl` for the canonical. */
	readonly path: string
	/** Absolute or root-relative image for the social card. Omitted entirely when there is none. */
	readonly image?: string
	/** `true` on pages that must not be indexed — search results, anything behind a login. */
	readonly noIndex?: boolean
}

/** Appended to every title. Kept short: search results truncate around 60 characters. */
export const SITE_NAME = 'Marketplace'

/**
 * Google renders roughly 155–160 characters of a description. Longer is not penalised, it is simply
 * cut — usually mid-word, which reads as a broken page. Truncating on a word boundary here keeps the
 * ellipsis deliberate.
 */
export const DESCRIPTION_MAX = 155

export const truncate = (text: string, max: number = DESCRIPTION_MAX): string => {
	const collapsed = text.replace(/\s+/g, ' ').trim()
	if (collapsed.length <= max) return collapsed

	const cut = collapsed.slice(0, max - 1)
	const lastSpace = cut.lastIndexOf(' ')

	// A single word longer than the limit has no space to cut at. `lastIndexOf` answers -1 there, and
	// slicing to -1 would drop the last character of an already-truncated string for no reason.
	return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`
}

/** `path` joined onto the configured origin. `siteUrl` already has its trailing slashes stripped. */
export const absoluteUrl = (path: string): string => `${env.siteUrl}${path.startsWith('/') ? path : `/${path}`}`

/**
 * The full head for one page.
 *
 * `og:url` and the canonical are the same absolute URL on purpose — they answer the same question for
 * two different consumers, and letting them disagree is how a page ends up shared under one address and
 * indexed under another.
 *
 * `noIndex` emits `noindex, follow`, not `noindex, nofollow`. A search-results page should not be in
 * the index, but the links on it lead to pages that should be: telling a crawler to ignore them throws
 * away the discovery for no gain.
 */
export const headFor = ({ title, description, path, image, noIndex = false }: SeoInput): HeadContent => {
	const url = absoluteUrl(path)
	const fullTitle = title === SITE_NAME ? title : `${title} · ${SITE_NAME}`
	const summary = truncate(description)

	const meta: MetaTag[] = [
		{ title: fullTitle },
		{ name: 'description', content: summary },
		{ property: 'og:type', content: 'website' },
		{ property: 'og:site_name', content: SITE_NAME },
		{ property: 'og:title', content: fullTitle },
		{ property: 'og:description', content: summary },
		{ property: 'og:url', content: url },
		{ name: 'twitter:card', content: image === undefined ? 'summary' : 'summary_large_image' },
		{ name: 'twitter:title', content: fullTitle },
		{ name: 'twitter:description', content: summary }
	]

	if (image !== undefined) {
		const absolute = image.startsWith('http') ? image : absoluteUrl(image)
		meta.push({ property: 'og:image', content: absolute }, { name: 'twitter:image', content: absolute })
	}

	if (noIndex) meta.push({ name: 'robots', content: 'noindex, follow' })

	return { meta, links: [{ rel: 'canonical', href: url }] }
}
