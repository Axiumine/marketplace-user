import type { ReactNode } from 'react'

/**
 * The submit control for every form in the app.
 *
 * ⚠️ **The label changes while a submit is in flight; the button is not replaced by a spinner.** A
 * control that vanishes mid-action moves everything below it, and a screen reader loses the element it
 * had focus on. Keeping the same button and swapping its text means `aria-busy` and the new label are
 * announced on the element the person is already standing on.
 *
 * Disabled while busy, which is the only thing standing between a double-click and two registrations.
 * The server rate-limits as well — this is the cheap half of that pair, not a replacement for it.
 */
export interface SubmitButtonProps {
	readonly busy: boolean
	readonly children: ReactNode
	readonly busyLabel?: string
	readonly disabled?: boolean
}

export const SubmitButton = ({ busy, children, busyLabel = 'Working…', disabled = false }: SubmitButtonProps) => (
	<button
		type="submit"
		disabled={busy || disabled}
		aria-busy={busy}
		className="rounded-box bg-palette-bg px-4 py-2 text-sm font-medium text-palette-white disabled:opacity-60"
	>
		{busy ? busyLabel : children}
	</button>
)
