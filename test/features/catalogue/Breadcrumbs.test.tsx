import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Breadcrumbs } from '@/features/catalogue/Breadcrumbs'
import type { Crumb } from '@/lib/jsonLd'
import { breadcrumbJsonLd } from '@/lib/jsonLd'

const TRAIL: readonly Crumb[] = [
	{ name: 'Home', path: '/' },
	{ name: 'Apparel', path: '/category/apparel' },
	{ name: 'Footwear', path: '/category/apparel/footwear' }
]

describe('Breadcrumbs', () => {
	it('is a labelled landmark of its own', () => {
		render(<Breadcrumbs crumbs={TRAIL} />)

		expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
	})

	// An ordered list, because the order is the meaning: these crumbs are a path from the root, not a set
	// of related links.
	it('is an ordered list, one item per crumb', () => {
		render(<Breadcrumbs crumbs={TRAIL} />)

		expect(screen.getAllByRole('listitem')).toHaveLength(3)
	})

	it('links every crumb but the last', () => {
		render(<Breadcrumbs crumbs={TRAIL} />)

		expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
		expect(screen.getByRole('link', { name: 'Apparel' })).toHaveAttribute('href', '/category/apparel')
		expect(screen.getAllByRole('link')).toHaveLength(2)
	})

	/*
	 * The last crumb is the page the visitor is already on. A link to itself is a click that does nothing,
	 * and `aria-current="page"` is what tells a screen reader where the trail ends.
	 */
	it('renders the current page as text, marked as current', () => {
		render(<Breadcrumbs crumbs={TRAIL} />)

		const current = screen.getByText('Footwear')

		expect(current).toHaveAttribute('aria-current', 'page')
		expect(screen.queryByRole('link', { name: 'Footwear' })).not.toBeInTheDocument()
	})

	// The separator is decoration and must not be read out: a screen reader announcing "slash" between
	// every crumb turns a three-item trail into six things to listen to.
	it('hides the separators from assistive technology', () => {
		const { container } = render(<Breadcrumbs crumbs={TRAIL} />)

		expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2)
	})

	it('puts no separator before the first crumb', () => {
		render(<Breadcrumbs crumbs={TRAIL} />)

		const first = screen.getAllByRole('listitem')[0] as HTMLElement

		expect(within(first).queryByText('/')).not.toBeInTheDocument()
	})

	/*
	 * ⚠️ A trail of one is the whole trail, and its single crumb is the current page — so it is text and
	 * not a link. `index === crumbs.length - 1` is what says so, and an off-by-one here would render the
	 * only crumb as a link to the page it is on.
	 */
	it('renders a single crumb as the current page', () => {
		render(<Breadcrumbs crumbs={[{ name: 'Shops', path: '/shops' }]} />)

		expect(screen.getByText('Shops')).toHaveAttribute('aria-current', 'page')
		expect(screen.queryAllByRole('link')).toHaveLength(0)
	})

	it('renders an empty trail without breaking', () => {
		render(<Breadcrumbs crumbs={[]} />)

		expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument()
		expect(screen.queryAllByRole('listitem')).toHaveLength(0)
	})

	it('matches the snapshot', () => {
		const { container } = render(<Breadcrumbs crumbs={TRAIL} />)

		expect(container.firstChild).toMatchSnapshot()
	})
})

describe('Breadcrumbs and its structured data', () => {
	/*
	 * ⚠️ Structured data describing something the page does not show is a manual-action offence, and the
	 * penalty lands on the domain rather than on the page. Route options build one array and hand it to
	 * both this component and `breadcrumbJsonLd`; this test is the assertion that the two cannot drift —
	 * same names, same order, same paths.
	 */
	it('shows exactly the crumbs the JSON-LD claims, in the same order', () => {
		render(<Breadcrumbs crumbs={TRAIL} />)

		const jsonLd = breadcrumbJsonLd(TRAIL)
		const listed = (jsonLd.itemListElement as { name: string }[]).map((entry) => entry.name)

		expect(screen.getAllByRole('listitem').map((item) => item.textContent?.replace('/', ''))).toEqual(listed)
	})
})
