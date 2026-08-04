import type { InputHTMLAttributes, Ref } from 'react'

/**
 * A labelled text input that reports its own validation error.
 *
 * Three things it does that a bare `<input>` does not, all of them required rather than decorative:
 *
 * - **`htmlFor`/`id` are wired from one `name`.** A label that is not programmatically associated is
 *   read as loose text, and clicking it does not focus the field.
 * - **`aria-invalid` and `aria-describedby`.** Colour alone does not communicate a failure, and an error
 *   message that is not referenced by the input is never read out when the field takes focus.
 * - **`autoComplete` is required, not optional.** Password managers key off it, and getting it wrong on
 *   a login form is the difference between a browser offering the saved password and offering nothing.
 *   Making it mandatory means every call site has to have decided.
 *
 * It takes a `ref` rather than wrapping `register()`: react-hook-form's `register` returns
 * `{name, onChange, onBlur, ref}`, and spreading that into `...rest` keeps this component ignorant of
 * the form library. A field can therefore be rendered uncontrolled, controlled, or in a test with no
 * form at all.
 */
export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
	readonly name: string
	readonly label: string
	readonly autoComplete: string
	/**
	 * ⚠️ `| undefined` is written out, and it has to be. `tsconfig.json` sets
	 * `exactOptionalPropertyTypes: true`, under which `error?: string` means "absent, or a string" and
	 * **rejects an explicit `undefined`** — so `error={errors.email?.message}`, the shape every call site
	 * here uses, fails to compile. Spelling the union makes "present but empty" expressible, which is what
	 * a form field genuinely wants: the prop is always passed and its value is what varies.
	 */
	readonly error?: string | undefined
	/** Static guidance shown under the field, read out alongside the error when both are present. */
	readonly hint?: string | undefined
	readonly ref?: Ref<HTMLInputElement>
}

export const TextField = ({ name, label, error, hint, ref, ...rest }: TextFieldProps) => {
	const errorId = `${name}-error`
	const hintId = `${name}-hint`
	const describedBy = [hint === undefined ? undefined : hintId, error === undefined ? undefined : errorId]
		.filter((id) => id !== undefined)
		.join(' ')

	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={name} className="text-sm font-medium text-palette-bg">
				{label}
			</label>

			<input
				{...rest}
				ref={ref}
				id={name}
				name={name}
				aria-invalid={error === undefined ? undefined : true}
				// An empty string here would still be an attribute, and `aria-describedby=""` points at a
				// non-existent element rather than at nothing.
				aria-describedby={describedBy === '' ? undefined : describedBy}
				className={`rounded-box border px-3 py-2 text-sm outline-none focus:border-palette-bg ${
					error === undefined ? 'border-slate-300' : 'border-app-error'
				}`}
			/>

			{hint !== undefined && (
				<p id={hintId} className="text-xs text-tip">
					{hint}
				</p>
			)}

			{error !== undefined && (
				<p id={errorId} className="text-xs text-app-error">
					{error}
				</p>
			)}
		</div>
	)
}
