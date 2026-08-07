import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { NotFound } from '@/components/layout/NotFound'

import type { GraphQLReplies } from '../../helpers/graphql'
import { stubGraphQL } from '../../helpers/graphql'
import { renderWithRouter } from '../../helpers/render'

const HOME: GraphQLReplies = {
	Companies: { data: { companies: { nodes: [], total: 0 } } },
	ItemCategories: { data: { itemCategories: [] } }
}

const mount = async () => {
	stubGraphQL(HOME)

	return renderWithRouter(<NotFound />)
}

describe('NotFound', () => {
	it('says what happened', async () => {
		await mount()

		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('This page does not exist')
	})

	/*
	 * ⚠️ The status code is the framework's to send — this component is the body of a real HTTP 404. The
	 * visible "404" is for the visitor; a crawler reads the status line. A 200 carrying this markup is a
	 * soft 404 and gets indexed as a real page, which is why this is `defaultNotFoundComponent` rather
	 * than something a loader renders on its own.
	 */
	it('shows the status to the visitor', async () => {
		await mount()

		expect(screen.getByText('404')).toBeInTheDocument()
	})

	// Both plausible causes, because the second is the common one here: a shop that was published when the
	// crawler saw it and unpublished by the time the visitor followed the link.
	it('names both reasons a customer could be here', async () => {
		await mount()

		expect(screen.getByText(/mistyped/)).toHaveTextContent('no longer be published')
	})

	it('offers a way out', async () => {
		await mount()

		expect(screen.getByRole('link', { name: 'Back to the home page' })).toHaveAttribute('href', '/')
	})

	/*
	 * No `noindex`. It would be redundant on a genuine 404 — the status code already says it — and a
	 * `<meta>` tag cannot be trusted to arrive before the status line anyway.
	 */
	it('sets no robots meta of its own', async () => {
		const { container } = await mount()

		expect(container.querySelector('meta[name="robots"]')).toBeNull()
	})

	it('is the page, not a fragment of one', async () => {
		const { container } = await mount()

		expect(container.querySelector('main')).not.toBeNull()
	})
})
