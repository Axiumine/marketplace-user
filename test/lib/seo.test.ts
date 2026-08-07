import { describe, expect, it } from 'vitest'

import { absoluteUrl, DESCRIPTION_MAX, headFor, SITE_NAME, truncate } from '@/lib/seo'

/** The site origin every test here asserts against. `VITE_SITE_URL` is pinned empty in vitest.config.ts. */
const ORIGIN = 'http://127.0.0.1:3045'

describe('truncate', () => {
	it('leaves a description that already fits', () => {
		expect(truncate('Panificio artigianale a Milano.')).toBe('Panificio artigianale a Milano.')
	})

	// Newlines and runs of spaces come from a shop's own description field, which is a textarea. Left
	// alone they reach the `<meta name="description">` attribute verbatim and the tag renders unusable.
	it('collapses every run of whitespace into a single space', () => {
		expect(truncate('Pane\n\n  e   focacce\t.')).toBe('Pane e focacce .')
	})

	it('trims the ends', () => {
		expect(truncate('   Pane   ')).toBe('Pane')
	})

	it('keeps a description of exactly the limit whole, with no ellipsis', () => {
		const exact = 'a'.repeat(DESCRIPTION_MAX)

		expect(truncate(exact)).toBe(exact)
		expect(truncate(exact)).not.toContain('…')
	})

	/*
	 * Google cuts at roughly 155 characters whatever this does, usually mid-word — which reads as a
	 * broken page rather than as a summary. Cutting on a word boundary makes the ellipsis deliberate.
	 */
	it('cuts on a word boundary and marks the cut', () => {
		const long = `${'parola '.repeat(30)}fine`
		const result = truncate(long)

		expect(result.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
		expect(result.endsWith('…')).toBe(true)
		expect(result).not.toContain('parol…')
	})

	// `lastIndexOf` answers -1 when there is no space to cut at, and slicing to -1 would drop the last
	// character of a string that was already shortened — one character lost for no reason at all.
	it('cuts a single word longer than the limit at the limit, losing nothing extra', () => {
		const oneWord = 'a'.repeat(DESCRIPTION_MAX + 50)

		expect(truncate(oneWord)).toBe(`${'a'.repeat(DESCRIPTION_MAX - 1)}…`)
	})

	it('takes a limit of its own', () => {
		expect(truncate('uno due tre quattro', 10)).toBe('uno due…')
	})
})

describe('absoluteUrl', () => {
	it('joins a root-relative path onto the configured origin', () => {
		expect(absoluteUrl('/shops')).toBe(`${ORIGIN}/shops`)
	})

	/*
	 * ⚠️ The path is concatenated, not normalised: a path with no leading slash produces a wrong URL rather
	 * than a corrected one. That is deliberate — the forgiving version made `absoluteUrl('')` and
	 * `absoluteUrl('/')` the same string, and with it every `path: '/'` in a route head and every
	 * `{ name: 'Home', path: '/' }` crumb became a value no assertion anywhere could pin down.
	 */
	it('does not repair a path that is missing its leading slash', () => {
		expect(absoluteUrl('shops')).toBe(`${ORIGIN}shops`)
		expect(absoluteUrl('')).toBe(ORIGIN)
	})

	it('keeps a query string', () => {
		expect(absoluteUrl('/search?q=pane')).toBe(`${ORIGIN}/search?q=pane`)
	})

	it('answers the origin itself for the root path', () => {
		expect(absoluteUrl('/')).toBe(`${ORIGIN}/`)
	})
})

describe('headFor', () => {
	const meta = (content: ReturnType<typeof headFor>, key: 'name' | 'property', value: string): string | undefined =>
		content.meta.find((tag) => tag[key] === value)?.content

	it('appends the site name to a page title', () => {
		expect(headFor({ title: 'Negozi', description: 'x', path: '/shops' }).meta[0]).toEqual({
			title: `Negozi · ${SITE_NAME}`
		})
	})

	// The home page is titled `Marketplace`, not `Marketplace · Marketplace`.
	it('does not append the site name to the site name', () => {
		expect(headFor({ title: SITE_NAME, description: 'x', path: '/' }).meta[0]).toEqual({ title: SITE_NAME })
	})

	it('truncates the description everywhere it appears', () => {
		const long = `${'parola '.repeat(40)}fine`
		const content = headFor({ title: 'Negozi', description: long, path: '/shops' })
		const summary = truncate(long)

		expect(meta(content, 'name', 'description')).toBe(summary)
		expect(meta(content, 'property', 'og:description')).toBe(summary)
		expect(meta(content, 'name', 'twitter:description')).toBe(summary)
	})

	/*
	 * `og:url` and the canonical are the same absolute URL, and letting them disagree is how a page ends
	 * up shared under one address and indexed under another — the share count and the ranking then
	 * accrue to two different URLs, neither of which has both.
	 */
	it('points og:url and the canonical at the same absolute URL', () => {
		const content = headFor({ title: 'Negozi', description: 'x', path: '/shops' })

		expect(content.links).toEqual([{ rel: 'canonical', href: `${ORIGIN}/shops` }])
		expect(meta(content, 'property', 'og:url')).toBe(`${ORIGIN}/shops`)
	})

	it('declares the site name and a website og:type', () => {
		const content = headFor({ title: 'Negozi', description: 'x', path: '/shops' })

		expect(meta(content, 'property', 'og:site_name')).toBe(SITE_NAME)
		expect(meta(content, 'property', 'og:type')).toBe('website')
	})

	it('repeats the full title in the og and twitter cards', () => {
		const content = headFor({ title: 'Negozi', description: 'x', path: '/shops' })

		expect(meta(content, 'property', 'og:title')).toBe(`Negozi · ${SITE_NAME}`)
		expect(meta(content, 'name', 'twitter:title')).toBe(`Negozi · ${SITE_NAME}`)
	})

	describe('the social image', () => {
		// A summary card with no image is a small square; claiming `summary_large_image` without one
		// renders as a blank banner where the picture should be.
		it('asks for the small card when there is no image', () => {
			const content = headFor({ title: 'Negozi', description: 'x', path: '/shops' })

			expect(meta(content, 'name', 'twitter:card')).toBe('summary')
			expect(meta(content, 'property', 'og:image')).toBeUndefined()
			expect(meta(content, 'name', 'twitter:image')).toBeUndefined()
		})

		it('asks for the large card and emits both image tags when there is one', () => {
			const content = headFor({ title: 'Negozio', description: 'x', path: '/shop/pane', image: '/img/pane.jpg' })

			expect(meta(content, 'name', 'twitter:card')).toBe('summary_large_image')
			expect(meta(content, 'property', 'og:image')).toBe(`${ORIGIN}/img/pane.jpg`)
			expect(meta(content, 'name', 'twitter:image')).toBe(`${ORIGIN}/img/pane.jpg`)
		})

		// A social crawler fetches the image from a different host than the page, so a relative URL is
		// unresolvable to it — and an image already on a CDN must not be rewritten onto this origin.
		it('leaves an image that is already absolute alone', () => {
			const content = headFor({
				title: 'Negozio',
				description: 'x',
				path: '/shop/pane',
				image: 'https://cdn.example.it/pane.jpg'
			})

			expect(meta(content, 'property', 'og:image')).toBe('https://cdn.example.it/pane.jpg')
		})
	})

	describe('noIndex', () => {
		it('emits no robots tag by default', () => {
			expect(meta(headFor({ title: 'Negozi', description: 'x', path: '/shops' }), 'name', 'robots')).toBeUndefined()
		})

		/*
		 * `follow`, not `nofollow`. A search-results page should not be indexed, but every link on it
		 * leads to a page that should be — telling the crawler to ignore them throws the discovery away
		 * and gains nothing, since the page is out of the index either way.
		 */
		it('emits noindex with follow, so the links on the page are still discovered', () => {
			const content = headFor({ title: 'Cerca', description: 'x', path: '/search', noIndex: true })

			expect(meta(content, 'name', 'robots')).toBe('noindex, follow')
		})

		it('still emits a canonical, because the page has one even when it is not indexed', () => {
			const content = headFor({ title: 'Cerca', description: 'x', path: '/search', noIndex: true })

			expect(content.links).toEqual([{ rel: 'canonical', href: `${ORIGIN}/search` }])
		})
	})
})
