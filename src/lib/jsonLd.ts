import { absoluteUrl, SITE_NAME, siteRootUrl } from '@/lib/seo'

/**
 * schema.org structured data, as plain objects.
 *
 * This is what turns a shop page into a rich result — an address, opening hours and a map pin in the
 * search listing rather than a blue link. It is also the only machine-readable description of the
 * catalogue this platform publishes.
 *
 * ⚠️ **Structured data must describe what the page actually shows.** Marking up a price the page does
 * not display, or a rating that does not exist, is a manual-action offence and gets the whole domain's
 * rich results turned off — not just the offending page. There is no `price` in `Product` below for
 * exactly that reason: `item` has no price field, because orders and payment are out of scope.
 *
 * Emitted through `<script type="application/ld+json">`, which means `dangerouslySetInnerHTML` and
 * therefore a real injection surface: a shop description containing `</script>` would close the tag
 * early and everything after it becomes markup. `serializeJsonLd` below is the only sanctioned way to
 * stringify these — never `JSON.stringify` at a call site.
 */

export type JsonLd = Record<string, unknown>

export interface JsonLdAddress {
	readonly street: string
	readonly postalCode: string
	readonly city: string
	readonly province: string
}

export interface JsonLdPosition {
	/** GeoJSON order: `[longitude, latitude]`. schema.org wants them the other way round. */
	readonly coordinates: readonly number[]
}

export interface JsonLdCompany {
	readonly publicName: string
	readonly slug: string
	readonly description?: string | null
	readonly address: JsonLdAddress & { readonly position?: JsonLdPosition | null }
}

/**
 * Escapes the three sequences that can break out of a `<script>` block.
 *
 * `<` and `>` are escaped as unicode rather than HTML-escaped, because the content of a
 * `type="application/ld+json"` block is **not** HTML — an `&lt;` there stays a literal `&lt;` in the
 * parsed JSON and corrupts the value. `\u003c` is a JSON string escape and parses back to `<`, so the
 * data survives intact while the HTML parser never sees a tag. `&` is escaped for the same reason a
 * conservative serialiser does: it costs nothing and it removes any argument about entity handling.
 */
export const serializeJsonLd = (data: JsonLd): string =>
	JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')

/**
 * The `head().scripts` entries for one or more JSON-LD blocks.
 *
 * The router renders a script descriptor whose `type` is neither `text/javascript` nor `module` as inert
 * data, server-side, through `dangerouslySetInnerHTML` — which is exactly what a `ld+json` block is and
 * why `serializeJsonLd` is not optional. Route options call this and never build the descriptor by hand.
 *
 * Several blocks rather than one array is deliberate: a page carrying both a `Store` and a
 * `BreadcrumbList` emits two `<script>` tags, which is what every consumer expects to find.
 */
export const jsonLdScripts = (...blocks: readonly JsonLd[]) =>
	blocks.map((block) => ({ type: 'application/ld+json', children: serializeJsonLd(block) }))

/** `Store` is a `LocalBusiness` with a storefront — the closest schema.org type to a shop here. */
export const storeJsonLd = (company: JsonLdCompany): JsonLd => {
	const data: JsonLd = {
		'@context': 'https://schema.org',
		'@type': 'Store',
		name: company.publicName,
		url: absoluteUrl(`/shop/${company.slug}`),
		address: {
			'@type': 'PostalAddress',
			streetAddress: company.address.street,
			postalCode: company.address.postalCode,
			addressLocality: company.address.city,
			addressRegion: company.address.province,
			addressCountry: 'IT'
		}
	}

	if (company.description !== undefined && company.description !== null && company.description !== '') {
		data.description = company.description
	}

	// ⚠️ GeoJSON is `[lng, lat]`; schema.org's `latitude`/`longitude` are named fields. Reading the tuple
	// in the wrong order puts a shop in the Southern Ocean, and nothing in the page looks wrong
	// — only the map pin in the search result does.
	const coordinates = company.address.position?.coordinates
	if (coordinates !== undefined && coordinates.length === 2) {
		data.geo = { '@type': 'GeoCoordinates', longitude: coordinates[0], latitude: coordinates[1] }
	}

	return data
}

export interface JsonLdItem {
	readonly name: string
	readonly description: string
	readonly slug: string
	readonly companySlug: string
	readonly companyPublicName: string
}

/**
 * `Product` **without** `offers`.
 *
 * An `offers` block needs a price and an availability, and this platform has neither: `item` carries
 * `name` and `description` only, because cart, order state and payment are out of scope. Inventing a
 * price to satisfy a validator would be marking up something the page does not show.
 */
export const productJsonLd = (item: JsonLdItem): JsonLd => ({
	'@context': 'https://schema.org',
	'@type': 'Product',
	name: item.name,
	description: item.description,
	url: absoluteUrl(`/shop/${item.companySlug}/item/${item.slug}`),
	brand: { '@type': 'Organization', name: item.companyPublicName }
})

export interface Crumb {
	readonly name: string
	readonly path: string
}

/** `position` is 1-based in the spec, and a 0-based list is silently ignored rather than rejected. */
export const breadcrumbJsonLd = (crumbs: readonly Crumb[]): JsonLd => ({
	'@context': 'https://schema.org',
	'@type': 'BreadcrumbList',
	itemListElement: crumbs.map((crumb, index) => ({
		'@type': 'ListItem',
		position: index + 1,
		name: crumb.name,
		item: absoluteUrl(crumb.path)
	}))
})

/**
 * An `ItemList` of URLs for a listing page.
 *
 * `offset` is what makes page 2 honest: its first entry is position 21, not position 1. A listing that
 * restarts the numbering on every page is describing twenty different lists that all claim to be the
 * first twenty results.
 */
export const itemListJsonLd = (paths: readonly string[], offset = 0): JsonLd => ({
	'@context': 'https://schema.org',
	'@type': 'ItemList',
	itemListElement: paths.map((path, index) => ({
		'@type': 'ListItem',
		position: offset + index + 1,
		url: absoluteUrl(path)
	}))
})

/**
 * `WebSite` + `SearchAction`, emitted once on the home page.
 *
 * This is what can produce a search box under the domain in a result listing. `query-input` names the
 * template variable, and the two spellings have to match exactly — `search_term_string` in both places
 * — or the whole action is dropped without a warning.
 */
export const websiteJsonLd = (): JsonLd => ({
	'@context': 'https://schema.org',
	'@type': 'WebSite',
	name: SITE_NAME,
	url: siteRootUrl(),
	potentialAction: {
		'@type': 'SearchAction',
		target: { '@type': 'EntryPoint', urlTemplate: `${absoluteUrl('/search')}?q={search_term_string}` },
		'query-input': 'required name=search_term_string'
	}
})
