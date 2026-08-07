import { describe, expect, it } from 'vitest'

import type { JsonLdCompany } from '@/lib/jsonLd'
import {
	breadcrumbJsonLd,
	itemListJsonLd,
	jsonLdScripts,
	productJsonLd,
	serializeJsonLd,
	storeJsonLd,
	websiteJsonLd
} from '@/lib/jsonLd'
import { SITE_NAME } from '@/lib/seo'

const ORIGIN = 'http://127.0.0.1:3045'

const COMPANY: JsonLdCompany = {
	publicName: 'Panificio Rossi',
	slug: 'panificio-rossi',
	description: 'Pane e focacce dal 1975.',
	address: {
		street: 'Via Dante 3',
		postalCode: '20121',
		city: 'Milano',
		province: 'MI',
		position: { coordinates: [9.1859, 45.4668] }
	}
}

/*
 * The block is emitted through `dangerouslySetInnerHTML`, so this is a real injection surface: a shop
 * description is text an owner typed, and it reaches the page inside a `<script>` element. Every case
 * here is a sequence that closes that element early and turns the rest of the document into markup.
 */
describe('serializeJsonLd', () => {
	it('escapes a closing script tag so it cannot end the block', () => {
		const serialized = serializeJsonLd({ description: '</script><img src=x onerror=alert(1)>' })

		expect(serialized).not.toContain('</script>')
		expect(serialized).not.toContain('<')
		expect(serialized).not.toContain('>')
	})

	/*
	 * ⚠️ Unicode escapes, not HTML entities. The content of a `type="application/ld+json"` block is not
	 * HTML, so an `&lt;` written there stays the literal four characters `&lt;` once the JSON is parsed
	 * and corrupts the value. `<` is a JSON string escape: the HTML parser never sees a tag, and the
	 * consumer parses it back to `<`.
	 */
	it('escapes with JSON unicode rather than HTML entities, so the value survives the round trip', () => {
		const serialized = serializeJsonLd({ description: 'a < b > c & d' })

		expect(serialized).toContain('\\u003c')
		expect(serialized).toContain('\\u003e')
		expect(serialized).toContain('\\u0026')
		expect(serialized).not.toContain('&lt;')
		expect(JSON.parse(serialized)).toEqual({ description: 'a < b > c & d' })
	})

	it('leaves ordinary text alone', () => {
		expect(serializeJsonLd({ name: 'Panificio Rossi' })).toBe('{"name":"Panificio Rossi"}')
	})
})

describe('jsonLdScripts', () => {
	// Two blocks rather than one array: a page carrying a `Store` and a `BreadcrumbList` emits two
	// `<script>` tags, which is what every consumer looks for.
	it('makes one inert script descriptor per block', () => {
		const scripts = jsonLdScripts({ '@type': 'Store' }, { '@type': 'BreadcrumbList' })

		expect(scripts).toEqual([
			{ type: 'application/ld+json', children: '{"@type":"Store"}' },
			{ type: 'application/ld+json', children: '{"@type":"BreadcrumbList"}' }
		])
	})

	// The router renders a script whose `type` is neither `text/javascript` nor `module` as data through
	// `dangerouslySetInnerHTML`. Getting the type wrong turns the block into something a browser tries
	// to execute.
	it('declares the ld+json type that keeps the block inert', () => {
		expect(jsonLdScripts({})[0]?.type).toBe('application/ld+json')
	})

	it('escapes through `serializeJsonLd` rather than `JSON.stringify`', () => {
		expect(jsonLdScripts({ d: '</script>' })[0]?.children).not.toContain('</script>')
	})

	it('answers an empty list when there is nothing to emit', () => {
		expect(jsonLdScripts()).toEqual([])
	})
})

describe('storeJsonLd', () => {
	it('describes the shop as a Store at its own absolute URL', () => {
		const data = storeJsonLd(COMPANY)

		expect(data['@context']).toBe('https://schema.org')
		expect(data['@type']).toBe('Store')
		expect(data.name).toBe('Panificio Rossi')
		expect(data.url).toBe(`${ORIGIN}/shop/panificio-rossi`)
	})

	// The trading name, not the *ragione sociale*: `legalName` on a shop card is wrong, and it is wrong
	// in structured data for the same reason — it is not what the page shows.
	it('publishes the address as a PostalAddress, in Italy', () => {
		expect(storeJsonLd(COMPANY).address).toEqual({
			'@type': 'PostalAddress',
			streetAddress: 'Via Dante 3',
			postalCode: '20121',
			addressLocality: 'Milano',
			addressRegion: 'MI',
			addressCountry: 'IT'
		})
	})

	/*
	 * ⚠️ GeoJSON is `[longitude, latitude]` and schema.org names its two fields. Swapping them puts a
	 * Milanese bakery in the sea off Somalia — and nothing on the page looks wrong, only the pin in the
	 * search result does, which is the one place nobody is looking.
	 */
	it('reads the GeoJSON pair longitude first', () => {
		expect(storeJsonLd(COMPANY).geo).toEqual({
			'@type': 'GeoCoordinates',
			longitude: 9.1859,
			latitude: 45.4668
		})
	})

	/*
	 * The key is omitted rather than set to `undefined` in the first case: `exactOptionalPropertyTypes` is
	 * on, so `{ position: undefined }` does not type-check against `position?: JsonLdPosition | null`. Both
	 * shapes really do arrive — a resolver omits the field, and the codegen type spells the absence `null`.
	 */
	it('omits geo when the address carries no position at all', () => {
		const { street, postalCode, city, province } = COMPANY.address
		const data = storeJsonLd({ ...COMPANY, address: { street, postalCode, city, province } })

		expect(data.geo).toBeUndefined()
		expect('geo' in data).toBe(false)
	})

	it('omits geo for a null position', () => {
		const data = storeJsonLd({ ...COMPANY, address: { ...COMPANY.address, position: null } })

		expect(data.geo).toBeUndefined()
		expect('geo' in data).toBe(false)
	})

	// A one-element array reaches `latitude: undefined`, which serialises to a `GeoCoordinates` with one
	// field. Consumers treat that as a broken pin rather than as an absent one.
	it('omits geo for coordinates that are not a pair', () => {
		const data = storeJsonLd({ ...COMPANY, address: { ...COMPANY.address, position: { coordinates: [9.1859] } } })

		expect('geo' in data).toBe(false)
	})

	it('omits the description when the field is absent', () => {
		const { publicName, slug, address } = COMPANY

		expect('description' in storeJsonLd({ publicName, slug, address })).toBe(false)
	})

	// An empty string is not "no description": it is a field an owner cleared, and a `""` in the markup is
	// a validation warning rather than an omission.
	it.each([
		['null', null],
		['an empty string', '']
	])('omits the description when it is %s', (_label, description) => {
		expect('description' in storeJsonLd({ ...COMPANY, description })).toBe(false)
	})

	it('publishes the description when there is one', () => {
		expect(storeJsonLd(COMPANY).description).toBe('Pane e focacce dal 1975.')
	})
})

describe('productJsonLd', () => {
	const ITEM = {
		name: 'Focaccia genovese',
		description: 'Alta due centimetri, olio e sale grosso.',
		slug: 'focaccia-genovese',
		companySlug: 'panificio-rossi',
		companyPublicName: 'Panificio Rossi'
	}

	it('describes the item as a Product at its own absolute URL', () => {
		expect(productJsonLd(ITEM)).toEqual({
			'@context': 'https://schema.org',
			'@type': 'Product',
			name: 'Focaccia genovese',
			description: 'Alta due centimetri, olio e sale grosso.',
			url: `${ORIGIN}/shop/panificio-rossi/item/focaccia-genovese`,
			brand: { '@type': 'Organization', name: 'Panificio Rossi' }
		})
	})

	/*
	 * ⚠️ No `offers`, and this assertion is the guard on it. An `offers` block needs a price and an
	 * availability; `item` has neither, because cart, order state and payment are out of scope. Marking
	 * up a price the page does not display is a manual-action offence that turns off rich results for
	 * the whole domain, not just for the page that did it.
	 */
	it('publishes no offers, because there is no price to publish', () => {
		expect('offers' in productJsonLd(ITEM)).toBe(false)
	})
})

describe('breadcrumbJsonLd', () => {
	// 1-based per the spec, and a 0-based list is dropped silently rather than reported — which is the
	// worst way for it to be wrong.
	it('numbers the trail from one and makes every path absolute', () => {
		expect(
			breadcrumbJsonLd([
				{ name: 'Home', path: '/' },
				{ name: 'Negozi', path: '/shops' }
			])
		).toEqual({
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: [
				{ '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
				{ '@type': 'ListItem', position: 2, name: 'Negozi', item: `${ORIGIN}/shops` }
			]
		})
	})

	it('answers an empty list for an empty trail', () => {
		expect(breadcrumbJsonLd([]).itemListElement).toEqual([])
	})
})

describe('itemListJsonLd', () => {
	it('numbers a first page from one', () => {
		expect(itemListJsonLd(['/shop/a', '/shop/b'])).toEqual({
			'@context': 'https://schema.org',
			'@type': 'ItemList',
			itemListElement: [
				{ '@type': 'ListItem', position: 1, url: `${ORIGIN}/shop/a` },
				{ '@type': 'ListItem', position: 2, url: `${ORIGIN}/shop/b` }
			]
		})
	})

	/*
	 * The offset is what makes page 2 honest. Without it every page describes itself as the first twenty
	 * results, and a crawler reading five pages is told about five different lists that all claim the
	 * same positions.
	 */
	it('continues the numbering from the offset on a later page', () => {
		const data = itemListJsonLd(['/shop/x'], 24)

		expect(data.itemListElement).toEqual([{ '@type': 'ListItem', position: 25, url: `${ORIGIN}/shop/x` }])
	})

	it('answers an empty list for an empty page', () => {
		expect(itemListJsonLd([]).itemListElement).toEqual([])
	})
})

describe('websiteJsonLd', () => {
	// The context is what makes the rest of the object mean anything: without it a consumer has a bag of
	// strings whose keys resolve to no vocabulary, and it is dropped rather than reported.
	it('declares the site and the URL its search lives at', () => {
		const data = websiteJsonLd()

		expect(data['@context']).toBe('https://schema.org')
		expect(data['@type']).toBe('WebSite')
		expect(data.name).toBe(SITE_NAME)
		expect(data.url).toBe(`${ORIGIN}/`)
	})

	/*
	 * The two spellings of the template variable have to match exactly, and a mismatch drops the whole
	 * action with no warning anywhere — the site box simply never appears and there is nothing to debug.
	 */
	it('names the same template variable in the target and in query-input', () => {
		const data = websiteJsonLd()
		const action = data.potentialAction as Record<string, unknown>
		const target = action.target as Record<string, unknown>

		expect(target.urlTemplate).toBe(`${ORIGIN}/search?q={search_term_string}`)
		expect(action['query-input']).toBe('required name=search_term_string')
		expect(action['@type']).toBe('SearchAction')
		expect(target['@type']).toBe('EntryPoint')
	})
})
