/**
 * The one place a form reports how it went.
 *
 * ⚠️ **Inline, not a toast, and that is an accessibility decision rather than a taste one.** A toast
 * appears in a corner, unrelated to the control that caused it, and disappears on a timer — a screen
 * reader user who was still reading the field they submitted misses it entirely, and anyone using
 * magnification never sees the corner at all. Rendered next to the form, the message stays until
 * something replaces it. This is why `styles.css` deliberately does not carry the sibling panels'
 * toast-countdown keyframes.
 *
 * The `role` switches with the tone: `alert` interrupts whatever a screen reader is saying, which is
 * right for a failure and wrong for a success — an assertive announcement on every saved field talks
 * over the person using the page. `status` queues politely instead.
 */
export type StatusTone = 'ok' | 'error'

export interface FormStatusProps {
	readonly tone: StatusTone
	/**
	 * ⚠️ `| undefined` spelled out, because `exactOptionalPropertyTypes: true` makes `message?: string`
	 * mean "absent, or a string" and reject an explicit `undefined`. Every call site holds the message in
	 * a `useState<string | undefined>` and passes it unconditionally, so "present but empty" is exactly
	 * the state that has to be expressible — the component is always mounted (see the note above) and
	 * only its content varies.
	 */
	readonly message?: string | undefined
}

const TONE_CLASS: Record<StatusTone, string> = {
	ok: 'border-app-ok/40 bg-app-ok/10 text-app-ok',
	error: 'border-app-error/40 bg-app-error/10 text-app-error'
}

export const FormStatus = ({ tone, message }: FormStatusProps) => {
	// The element is rendered only when there is something to say, but the *container* it sits in is
	// always in the DOM (see each form) — a live region has to exist before its content changes, or the
	// change is never announced.
	if (message === undefined || message === '') return null

	return (
		<p role={tone === 'error' ? 'alert' : 'status'} className={`rounded-box border px-3 py-2 text-sm ${TONE_CLASS[tone]}`}>
			{message}
		</p>
	)
}
