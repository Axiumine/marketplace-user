import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EmptyState } from '@/features/catalogue/EmptyState'

describe('EmptyState', () => {
	it('states what is not there', () => {
		render(<EmptyState title="No shops in Boston yet" />)

		expect(screen.getByText('No shops in Boston yet')).toBeInTheDocument()
	})

	it('adds the hint when there is one', () => {
		render(<EmptyState title="No results" hint="Try a shorter search." />)

		expect(screen.getByText('Try a shorter search.')).toBeInTheDocument()
	})

	// No hint means no second paragraph — an empty line under the title reads as something that failed to
	// load rather than as a deliberately short message.
	it('renders no second paragraph when there is no hint', () => {
		const { container } = render(<EmptyState title="No results" />)

		expect(container.querySelectorAll('p')).toHaveLength(1)
	})

	/*
	 * ⚠️ Deliberately not an `alert`, and deliberately not the error boundary. An empty result and a failed
	 * request look identical to a visitor if both render "no results", and they need opposite reactions:
	 * one means try a different search, the other means try again. Nothing here claims anything went
	 * wrong.
	 */
	it('does not announce itself as an error', () => {
		render(<EmptyState title="No results" hint="Try a shorter search." />)

		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
		expect(screen.queryByRole('status')).not.toBeInTheDocument()
	})

	it('matches the snapshot with a hint', () => {
		const { container } = render(<EmptyState title="No results" hint="Try a shorter search." />)

		expect(container.firstChild).toMatchSnapshot()
	})

	it('matches the snapshot without a hint', () => {
		const { container } = render(<EmptyState title="No results" />)

		expect(container.firstChild).toMatchSnapshot()
	})
})
