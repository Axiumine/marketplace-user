import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { TextField } from '@/components/ui/TextField'

const renderField = (props: Partial<Parameters<typeof TextField>[0]> = {}) =>
	render(<TextField name="email" label="Email address" autoComplete="email" {...props} />)

describe('TextField', () => {
	/*
	 * The label is wired to the input through the one `name`. A label that is not programmatically
	 * associated is read as loose text and clicking it focuses nothing — `getByLabelText` finding the
	 * input is the assertion that the association exists.
	 */
	it('labels the input', () => {
		renderField()

		expect(screen.getByLabelText('Email address')).toBeInstanceOf(HTMLInputElement)
	})

	it('focuses the input when the label is clicked', async () => {
		renderField()

		await userEvent.click(screen.getByText('Email address'))

		expect(screen.getByLabelText('Email address')).toHaveFocus()
	})

	it('names the input for the form that submits it', () => {
		renderField()

		expect(screen.getByLabelText('Email address')).toHaveAttribute('name', 'email')
	})

	/*
	 * ⚠️ `autoComplete` is a required prop, not an optional one. Password managers key off it, and getting
	 * it wrong on a login form is the difference between the browser offering the saved password and
	 * offering nothing — making it mandatory means every call site had to decide.
	 */
	it('passes the autocomplete token through', () => {
		renderField({ autoComplete: 'current-password' })

		expect(screen.getByLabelText('Email address')).toHaveAttribute('autocomplete', 'current-password')
	})

	it('forwards the rest of the input attributes', () => {
		renderField({ type: 'password', required: true, placeholder: 'Your password', maxLength: 72 })
		const input = screen.getByLabelText('Email address')

		expect(input).toHaveAttribute('type', 'password')
		expect(input).toBeRequired()
		expect(input).toHaveAttribute('placeholder', 'Your password')
		expect(input).toHaveAttribute('maxlength', '72')
	})

	/*
	 * The `ref` goes to the DOM node rather than being wrapped, which is what lets a call site spread
	 * react-hook-form's `register()` — `{name, onChange, onBlur, ref}` — straight in and keeps this
	 * component ignorant of the form library.
	 */
	it('hands its ref to the input element', () => {
		const ref = createRef<HTMLInputElement>()
		render(<TextField name="email" label="Email address" autoComplete="email" ref={ref} />)

		expect(ref.current).toBe(screen.getByLabelText('Email address'))
	})

	it('reports what the customer typed', async () => {
		const onChange = vi.fn()
		renderField({ onChange })

		await userEvent.type(screen.getByLabelText('Email address'), 'ab')

		expect(onChange).toHaveBeenCalledTimes(2)
	})
})

describe('TextField without an error', () => {
	// `aria-invalid` must be absent, not `false`: the field is not in an error state, and an explicit
	// `aria-invalid="false"` on every untouched field is noise a screen reader reads out.
	it('is not marked invalid', () => {
		renderField()

		expect(screen.getByLabelText('Email address')).not.toHaveAttribute('aria-invalid')
	})

	// An empty `aria-describedby` is still an attribute, and it points at a non-existent element rather
	// than at nothing.
	it('describes itself with nothing rather than with an empty reference', () => {
		renderField()

		expect(screen.getByLabelText('Email address')).not.toHaveAttribute('aria-describedby')
	})

	/*
	 * Both paragraphs are absent, not present and empty. An `<p id="email-error">` with no text still
	 * matches the `aria-describedby` the error branch would point at, and a field that renders its own
	 * error container unconditionally is a field whose error state cannot be read off the DOM.
	 */
	it('renders neither the hint nor the error paragraph', () => {
		const { container } = renderField()

		expect(container.querySelector('#email-hint')).toBeNull()
		expect(container.querySelector('#email-error')).toBeNull()
	})

	/*
	 * The neutral border, asserted as the whole class string rather than with `toHaveClass`.
	 *
	 * `toHaveClass` passes on a superset, so it cannot tell the error variant apart from a field carrying
	 * both borders, and it cannot see a dropped class at all. The string is the component's entire visual
	 * contract and it is one line long — pinning it costs nothing and catches the case where the field
	 * looks valid while the form thinks it is not.
	 */
	it('draws a neutral border', () => {
		renderField()

		expect(screen.getByLabelText('Email address')).toHaveAttribute(
			'class',
			'rounded-box border px-3 py-2 text-sm outline-none focus:border-palette-bg border-slate-300'
		)
	})
})

describe('TextField with an error', () => {
	it('shows the message', () => {
		renderField({ error: 'Enter a valid address' })

		expect(screen.getByText('Enter a valid address')).toBeInTheDocument()
	})

	/*
	 * ⚠️ Colour alone does not communicate a failure. `aria-invalid` is what tells assistive technology
	 * the field is wrong, and `aria-describedby` is what makes the reason read out when the field takes
	 * focus — a message that is not referenced is never announced.
	 */
	it('marks the input invalid and points it at the message', () => {
		renderField({ error: 'Enter a valid address' })
		const input = screen.getByLabelText('Email address')

		expect(input).toHaveAttribute('aria-invalid', 'true')
		expect(input).toHaveAccessibleDescription('Enter a valid address')
	})

	// The red border replaces the neutral one rather than joining it — a field carrying both is a field
	// whose colour depends on stylesheet order.
	it('draws the error border in place of the neutral one', () => {
		renderField({ error: 'Enter a valid address' })

		expect(screen.getByLabelText('Email address')).toHaveAttribute(
			'class',
			'rounded-box border px-3 py-2 text-sm outline-none focus:border-palette-bg border-app-error'
		)
	})

	it('gives the message an id derived from the field name', () => {
		renderField({ error: 'Enter a valid address' })

		expect(screen.getByText('Enter a valid address')).toHaveAttribute('id', 'email-error')
	})

	// An empty string is a message: a call site holding `errors.email?.message` can produce one, and
	// treating it as absent would leave `aria-invalid` off a field the form considers wrong.
	it('treats an empty message as an error all the same', () => {
		renderField({ error: '' })

		expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true')
	})
})

describe('TextField with a hint', () => {
	it('shows the hint', () => {
		renderField({ hint: 'At least 12 characters' })

		expect(screen.getByText('At least 12 characters')).toBeInTheDocument()
	})

	it('describes the input with it', () => {
		renderField({ hint: 'At least 12 characters' })

		expect(screen.getByLabelText('Email address')).toHaveAccessibleDescription('At least 12 characters')
	})

	it('does not mark the field invalid', () => {
		renderField({ hint: 'At least 12 characters' })

		expect(screen.getByLabelText('Email address')).not.toHaveAttribute('aria-invalid')
	})

	/*
	 * Both, in that order — the hint first, then the error. A screen reader reads `aria-describedby` in
	 * the order the ids are listed, and the rule the field must satisfy makes no sense read after the
	 * complaint that it was not satisfied.
	 */
	it('reads the hint before the error when both are present', () => {
		renderField({ hint: 'At least 12 characters', error: 'Too short' })
		const input = screen.getByLabelText('Email address')

		expect(input).toHaveAttribute('aria-describedby', 'email-hint email-error')
		expect(input).toHaveAccessibleDescription('At least 12 characters Too short')
	})
})

describe('TextField snapshot', () => {
	it('renders without an error', () => {
		const { container } = renderField()

		expect(container.firstChild).toMatchSnapshot()
	})

	it('renders with an error', () => {
		const { container } = renderField({ error: 'Enter a valid address' })

		expect(container.firstChild).toMatchSnapshot()
	})
})
