import type { HeadContent, MetaTag } from '@/lib/seo'

/**
 * Readers for the plain-data head a route option returns.
 *
 * `head()` is called directly rather than asserted through `document.head`: under jsdom the router's
 * `HeadContent` lands a render later than the assertion, and the tag descriptors *are* the contract — the
 * whole reason the behaviour lives in `src/routeOptions/` instead of in the route file.
 */

export interface ScriptTag {
	readonly type: string
	readonly children: string
}

export interface RouteHead extends HeadContent {
	readonly scripts?: ScriptTag[]
}

export const titleOf = (head: RouteHead): string | undefined => head.meta.find((tag) => tag.title !== undefined)?.title

export const metaOf = (head: RouteHead, name: string): string | undefined =>
	head.meta.find((tag: MetaTag) => tag.name === name)?.content

export const propertyOf = (head: RouteHead, property: string): string | undefined =>
	head.meta.find((tag: MetaTag) => tag.property === property)?.content

export const canonicalOf = (head: RouteHead): string | undefined => head.links.find((link) => link.rel === 'canonical')?.href

export const linkOf = (head: RouteHead, rel: string): string | undefined => head.links.find((link) => link.rel === rel)?.href

/** The JSON-LD blocks, parsed back out of the `<script>` descriptors `jsonLdScripts` built. */
export const jsonLdOf = (head: RouteHead): Record<string, unknown>[] =>
	(head.scripts ?? [])
		.filter((script) => script.type === 'application/ld+json')
		.map((script) => JSON.parse(script.children) as Record<string, unknown>)

export const jsonLdTyped = (head: RouteHead, type: string): Record<string, unknown> | undefined =>
	jsonLdOf(head).find((block) => block['@type'] === type)
