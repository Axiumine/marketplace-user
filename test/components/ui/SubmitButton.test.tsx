import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SubmitEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { SubmitButton } from '@/components/ui/SubmitButton'

describe('SubmitButton', () => {
	it('shows its label when idle', () => {
		render(<SubmitButton busy={false}>Sign in</SubmitButton>)

		expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
	})

	// `type="submit"`, so pressing Enter in any field of the form submits it. A bare `<button>` inside a
	// form defaults to submit, but the two sibling apps both had one that did not — it is worth pinning.
	it('submits the form it sits in', () => {
		render(<SubmitButton busy={false}>Sign in</SubmitButton>)

		expect(screen.getByRole('button', { name: 'Sign in' })).toHaveAttribute('type', 'submit')
	})

	it('is clickable when idle', async () => {
		const onSubmit = vi.fn((event: SubmitEvent) => {
			event.preventDefault()
		})
		render(
			<form onSubmit={onSubmit}>
				<SubmitButton busy={false}>Sign in</SubmitButton>
			</form>
		)

		await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

		expect(onSubmit).toHaveBeenCalledTimes(1)
	})
})

describe('SubmitButton while busy', () => {
	/*
	 * ⚠️ The same button with a different label — never replaced by a spinner. A control that vanishes
	 * mid-action moves everything below it and a screen reader loses the element it had focus on. Keeping
	 * the button means `aria-busy` and the new label are announced on the element the person is already
	 * standing on.
	 */
	it('keeps the same button and swaps the text', () => {
		const { rerender } = render(<SubmitButton busy={false}>Sign in</SubmitButton>)
		const before = screen.getByRole('button')

		rerender(<SubmitButton busy>Sign in</SubmitButton>)

		expect(screen.getByRole('button')).toBe(before)
		expect(before).toHaveTextContent('Working…')
		expect(before).not.toHaveTextContent('Sign in')
	})

	it('says so with aria-busy', () => {
		render(<SubmitButton busy>Sign in</SubmitButton>)

		expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
	})

	it('is not busy when it is not', () => {
		render(<SubmitButton busy={false}>Sign in</SubmitButton>)

		expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'false')
	})

	it('takes a label of its own', () => {
		render(
			<SubmitButton busy busyLabel="Signing in…">
				Sign in
			</SubmitButton>
		)

		expect(screen.getByRole('button', { name: 'Signing in…' })).toBeInTheDocument()
	})

	/*
	 * Disabled while busy, which is the only thing standing between a double-click and two registrations.
	 * The server rate-limits as well — this is the cheap half of that pair, not a replacement for it.
	 */
	it('refuses a second click', async () => {
		const onSubmit = vi.fn((event: SubmitEvent) => {
			event.preventDefault()
		})
		render(
			<form onSubmit={onSubmit}>
				<SubmitButton busy>Sign in</SubmitButton>
			</form>
		)

		await userEvent.click(screen.getByRole('button'))

		expect(screen.getByRole('button')).toBeDisabled()
		expect(onSubmit).not.toHaveBeenCalled()
	})
})

describe('SubmitButton disabled on its own', () => {
	// Two independent reasons to be unclickable: a submit in flight, and a form that is not ready. The
	// second must not imply the first, or an unfilled form would announce itself as busy.
	it('is disabled without claiming to be busy', () => {
		render(
			<SubmitButton busy={false} disabled>
				Sign in
			</SubmitButton>
		)

		expect(screen.getByRole('button')).toBeDisabled()
		expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'false')
	})

	it('keeps its own label rather than the busy one', () => {
		render(
			<SubmitButton busy={false} disabled>
				Sign in
			</SubmitButton>
		)

		expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
	})

	it('is enabled when neither reason applies', () => {
		render(
			<SubmitButton busy={false} disabled={false}>
				Sign in
			</SubmitButton>
		)

		expect(screen.getByRole('button')).toBeEnabled()
	})

	it('is disabled when busy even if it was told it is not disabled', () => {
		render(
			<SubmitButton busy disabled={false}>
				Sign in
			</SubmitButton>
		)

		expect(screen.getByRole('button')).toBeDisabled()
	})
})

describe('SubmitButton snapshot', () => {
	it('renders idle', () => {
		const { container } = render(<SubmitButton busy={false}>Sign in</SubmitButton>)

		expect(container.firstChild).toMatchSnapshot()
	})

	it('renders busy', () => {
		const { container } = render(<SubmitButton busy>Sign in</SubmitButton>)

		expect(container.firstChild).toMatchSnapshot()
	})
})
