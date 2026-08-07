import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Pagination } from '@/features/catalogue/Pagination'
import { pageLinks } from '@/lib/pagination'

describe('Pagination', () => {
	it('is a labelled landmark of its own', () => {
		render(<Pagination prev="/shops" next="/shops?page=3" page={2} />)

		expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument()
	})

	it('says which page the visitor is on', () => {
		render(<Pagination prev="/shops" next="/shops?page=3" page={2} />)

		expect(screen.getByText('Page 2')).toBeInTheDocument()
	})

	/*
	 * ⚠️ Plain `<a href>`, not `<Link>` — the one place in this app where that is correct. These two
	 * anchors are built from the *same* strings as the `rel="prev"` / `rel="next"` head tags, and keeping
	 * them as strings is what guarantees the two can never disagree about what page 3's address is. They
	 * are also followed by a crawler, which is the state most visits to a listing page are in.
	 */
	it('renders real anchors carrying the relationship', () => {
		render(<Pagination prev="/shops" next="/shops?page=3" page={2} />)

		const previous = screen.getByRole('link', { name: '← Previous' })
		const next = screen.getByRole('link', { name: 'Next →' })

		expect(previous).toHaveAttribute('href', '/shops')
		expect(previous).toHaveAttribute('rel', 'prev')
		expect(next).toHaveAttribute('href', '/shops?page=3')
		expect(next).toHaveAttribute('rel', 'next')
	})

	/*
	 * Page 1 has no previous, and the last page has no next. Both are ordinary states rather than a reason
	 * to hide the whole control — the other direction is still there to click.
	 *
	 * ⚠️ The *text* is asserted absent, not only the link role. An `<a>` with no `href` is not a link to
	 * an accessibility tree — its role is `generic` — so a branch that rendered the anchor unconditionally
	 * would satisfy `queryByRole('link')` while putting a dead "← Previous" on page 1: visible, styled like
	 * the real control, and doing nothing when clicked.
	 */
	it('renders no previous link on the first page', () => {
		render(<Pagination next="/shops?page=2" page={1} />)

		expect(screen.queryByText('← Previous')).not.toBeInTheDocument()
		expect(screen.getByRole('link', { name: 'Next →' })).toBeInTheDocument()
	})

	it('renders no next link on the last page', () => {
		render(<Pagination prev="/shops?page=2" page={3} />)

		expect(screen.queryByText('Next →')).not.toBeInTheDocument()
		expect(screen.getByRole('link', { name: '← Previous' })).toBeInTheDocument()
	})

	/*
	 * The empty `<span>` on the missing side is what keeps `justify-between` putting the remaining link on
	 * its own side of the row: with one child, "Next" would slide to the left where "Previous" belongs.
	 */
	it('keeps the row’s two ends occupied when one direction is missing', () => {
		const { container } = render(<Pagination next="/shops?page=2" page={1} />)

		expect(container.querySelectorAll('nav > *')).toHaveLength(3)
	})

	/*
	 * ⚠️ Nothing at all when a listing fits on one page. A control offering neither direction is a row of
	 * furniture that says "Page 1" and does nothing — and on a page with no second page it also invites a
	 * crawler to look for one.
	 */
	it('renders nothing when there is only one page', () => {
		const { container } = render(<Pagination page={1} />)

		expect(container).toBeEmptyDOMElement()
	})
})

describe('Pagination and the head links', () => {
	/*
	 * ⚠️ The same strings, by construction. `pageLinks` produces what the route puts in `rel="prev"` /
	 * `rel="next"` and what it passes here, so a visible "Next" pointing at page 3 while the head says
	 * page 4 is impossible — this is the test that says so out loud.
	 */
	it('renders exactly the addresses pageLinks produced', () => {
		const { prev, next } = pageLinks('/shops', 2, true)

		render(<Pagination prev={prev} next={next} page={2} />)

		expect(screen.getByRole('link', { name: '← Previous' })).toHaveAttribute('href', prev as string)
		expect(screen.getByRole('link', { name: 'Next →' })).toHaveAttribute('href', next as string)
	})

	// Page 1's previous link is the bare path, not `?page=1` — a second URL for page 1 competing in the
	// index with the canonical one the same route emits.
	it('links back to the bare listing path from page two', () => {
		const { prev } = pageLinks('/shops', 2, false)

		render(<Pagination prev={prev} page={2} />)

		expect(screen.getByRole('link', { name: '← Previous' })).toHaveAttribute('href', '/shops')
	})
})
