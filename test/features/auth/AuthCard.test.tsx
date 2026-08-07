import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AuthCard } from '@/features/auth/AuthCard'

describe('AuthCard', () => {
	it('renders the title as the page heading', () => {
		render(<AuthCard title="Sign in">form</AuthCard>)

		expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in')
	})

	// One `<h1>` per screen, and it is this one — the auth routes render nothing above the card.
	it('renders the form it wraps', () => {
		render(<AuthCard title="Sign in">the login form</AuthCard>)

		expect(screen.getByText('the login form')).toBeInTheDocument()
	})

	it('renders the intro when there is one', () => {
		render(
			<AuthCard title="Reset your password" intro="Enter the address you registered with.">
				form
			</AuthCard>
		)

		expect(screen.getByText('Enter the address you registered with.')).toBeInTheDocument()
	})

	/*
	 * Absent rather than empty. An empty `<p>` still occupies a margin, so a card without an intro would
	 * sit lower than one with, and the two screens would not line up when a form navigates between them.
	 */
	it('renders no intro paragraph when there is none', () => {
		const { container } = render(<AuthCard title="Sign in">form</AuthCard>)

		expect(container.querySelectorAll('p')).toHaveLength(0)
	})

	it('renders the footer when there is one', () => {
		render(
			<AuthCard title="Sign in" footer={<a href="/register">Create an account</a>}>
				form
			</AuthCard>
		)

		expect(screen.getByRole('link', { name: 'Create an account' })).toBeInTheDocument()
	})

	/*
	 * ⚠️ The *box* is counted, not only its contents. An always-rendered footer container holding nothing
	 * is invisible to every content query while still carrying `mt-4` — so a card with no footer sits taller
	 * than it should, and a form that navigates from one auth screen to another jumps by that margin.
	 * `card.children` is the count: heading, optional intro, the card body, and the footer only when asked
	 * for.
	 */
	it('renders no footer container when there is none', () => {
		const { container } = render(<AuthCard title="Sign in">form</AuthCard>)

		expect(screen.queryByRole('link')).not.toBeInTheDocument()
		expect(container.firstElementChild?.children).toHaveLength(2)
	})

	it('renders the footer container only when there is a footer', () => {
		const { container } = render(
			<AuthCard title="Sign in" footer={<a href="/register">Create an account</a>}>
				form
			</AuthCard>
		)

		expect(container.firstElementChild?.children).toHaveLength(3)
	})

	// Empty strings are content, not absence: a caller that computes an intro and gets `''` asked for an
	// empty paragraph, and `undefined` is the only way to ask for none.
	it('treats an empty intro as an intro', () => {
		const { container } = render(
			<AuthCard title="Sign in" intro="">
				form
			</AuthCard>
		)

		expect(container.querySelectorAll('p')).toHaveLength(1)
	})
})
