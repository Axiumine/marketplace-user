import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { FormStatus } from '@/components/ui/FormStatus'

describe('FormStatus', () => {
	it('shows the message it was given', () => {
		render(<FormStatus tone="ok" message="Saved" />)

		expect(screen.getByText('Saved')).toBeInTheDocument()
	})

	/*
	 * ⚠️ The `role` switches with the tone, and this is the whole reason the tone exists. `alert`
	 * interrupts whatever a screen reader is saying — right for a failure, wrong for a success, where an
	 * assertive announcement on every saved field talks over the person using the page. `status` queues
	 * politely instead.
	 */
	it('interrupts for a failure', () => {
		render(<FormStatus tone="error" message="Something went wrong" />)

		expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
	})

	it('announces a success politely', () => {
		render(<FormStatus tone="ok" message="Saved" />)

		expect(screen.getByRole('status')).toHaveTextContent('Saved')
	})

	it('does not interrupt for a success', () => {
		render(<FormStatus tone="ok" message="Saved" />)

		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	it.each([
		['ok', 'text-app-ok'],
		['error', 'text-app-error']
	] as const)('colours a %s message', (tone, expected) => {
		render(<FormStatus tone={tone} message="Message" />)

		expect(screen.getByText('Message')).toHaveClass(expected)
	})

	// Nothing to say, nothing rendered. The *container* stays mounted in every form — a live region has to
	// exist before its content changes, or the change is never announced — but the message itself does not.
	it.each([
		['there is no message', undefined],
		['the message is empty', '']
	])('renders nothing when %s', (_label, message) => {
		const { container } = render(<FormStatus tone="ok" message={message} />)

		expect(container).toBeEmptyDOMElement()
	})

	it('renders nothing rather than an empty alert for a failure with no message', () => {
		render(<FormStatus tone="error" />)

		expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	})

	/*
	 * ⚠️ Inline, never a toast. A toast appears in a corner unrelated to the control that caused it and
	 * disappears on a timer: a screen reader user still reading the field they submitted misses it
	 * entirely, and anyone using magnification never sees the corner at all. Rendered next to the form,
	 * the message stays until something replaces it — so it must not carry a dismiss control or a timer.
	 */
	it('has nothing to dismiss and no timer to outlive', () => {
		render(<FormStatus tone="error" message="Something went wrong" />)

		expect(screen.queryByRole('button')).not.toBeInTheDocument()
		expect(screen.getByRole('alert')).not.toHaveClass('animate-toast')
	})

	it('replaces the message rather than stacking a second one', () => {
		const { rerender } = render(<FormStatus tone="error" message="First" />)
		rerender(<FormStatus tone="error" message="Second" />)

		expect(screen.queryByText('First')).not.toBeInTheDocument()
		expect(screen.getByText('Second')).toBeInTheDocument()
	})
})

describe('FormStatus snapshot', () => {
	it.each(['ok', 'error'] as const)('renders the %s tone', (tone) => {
		const { container } = render(<FormStatus tone={tone} message="Message" />)

		expect(container.firstChild).toMatchSnapshot()
	})
})
