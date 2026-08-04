import { useEffect, useId, useRef, useState } from 'react'

import { type FoundAddress, searchAddresses } from '@/lib/nominatim'

/**
 * Free-text address lookup against the on-premises Nominatim.
 *
 * It fills the form; it is not part of it. Picking a suggestion writes street, postal code, city,
 * province and the coordinate pair into the real fields, which stay visible and editable — OSM does not
 * know every address, and a form that can only be completed by the geocoder cannot accept a new building
 * or a rural one. That is also why nothing here is registered with react-hook-form: this input's value is
 * never submitted.
 *
 * ⚠️ **The abort is not an optimisation.** Somebody types faster than the network answers, so several
 * requests are in flight at once and they do not come back in order — an earlier one landing after a
 * later one replaces the good suggestions with stale ones, and the list then disagrees with the text in
 * the box. `searchAddresses` takes a required `AbortSignal` for exactly this reason.
 *
 * The debounce is the other half: without it every keystroke is a request, which for a geocoder running
 * on our own hardware is not a billing problem but is a CPU one — Nominatim answers a full-text query
 * against a PostgreSQL index, and it is the slowest thing this app talks to.
 */
const DEBOUNCE_MS = 350

/** Below this, results are noise: two characters match half of Italy and the query is the expensive part. */
const MIN_QUERY = 3

export interface AddressAutocompleteProps {
	readonly label: string
	readonly hint?: string
	readonly onPick: (address: FoundAddress) => void
}

export const AddressAutocomplete = ({ label, hint, onPick }: AddressAutocompleteProps) => {
	const id = useId()
	const listId = `${id}-list`
	const [query, setQuery] = useState('')
	const [results, setResults] = useState<readonly FoundAddress[]>([])
	const [failed, setFailed] = useState(false)
	const [busy, setBusy] = useState(false)

	/**
	 * Suppresses the search that a programmatic `setQuery` would otherwise trigger.
	 *
	 * Picking a suggestion writes its label back into the box, which changes `query`, which re-runs the
	 * effect and reopens the list under the cursor showing the thing that was just chosen. A ref rather
	 * than state because flipping it must not itself cause a render.
	 */
	const skip = useRef(false)

	/**
	 * Clears everything the last search produced.
	 *
	 * ⚠️ **Called from the change handler, never from the effect below**, and that is a rule rather than a
	 * preference: `react-hooks/set-state-in-effect` rejects a synchronous `setState` in an effect body —
	 * it schedules a second render pass for something that could have been decided during the first — and
	 * the eslint gate is an error, not a warning. The `setState` calls inside the debounce timer are fine
	 * by the same rule, because a timer callback is not the effect body.
	 *
	 * It is also the more honest place for it. A query only falls back under `MIN_QUERY` because somebody
	 * typed, so the clear belongs to the keystroke that caused it. `busy` is reset here too: the abort in
	 * the effect's cleanup makes `.finally` skip its `setBusy(false)` on purpose — a newer search owns the
	 * flag by then — but when the box is emptied there is no newer search to hand it to, and the live
	 * region would have gone on announcing "Searching" with nothing in flight.
	 */
	const resetSuggestions = (): void => {
		setResults([])
		setFailed(false)
		setBusy(false)
	}

	useEffect(() => {
		if (skip.current) {
			skip.current = false
			return
		}

		if (query.trim().length < MIN_QUERY) return

		const controller = new AbortController()
		const timer = setTimeout(() => {
			setBusy(true)
			setFailed(false)

			searchAddresses(query.trim(), controller.signal)
				.then((found) => {
					setResults(found)
				})
				.catch(() => {
					// An abort lands here too, and it is not a failure — it means a newer keystroke has taken
					// over. `controller.signal.aborted` is the only way to tell the two apart, and reporting an
					// abort as an error would make the message flash on every fast typist's screen.
					if (controller.signal.aborted) return

					setResults([])
					setFailed(true)
				})
				.finally(() => {
					if (!controller.signal.aborted) setBusy(false)
				})
		}, DEBOUNCE_MS)

		return () => {
			clearTimeout(timer)
			controller.abort()
		}
	}, [query])

	const pick = (address: FoundAddress): void => {
		skip.current = true
		setQuery(address.label)
		setResults([])
		onPick(address)
	}

	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={id} className="text-sm font-medium text-palette-bg">
				{label}
			</label>

			<input
				id={id}
				type="text"
				value={query}
				onChange={(event) => {
					const value = event.target.value
					setQuery(value)
					if (value.trim().length < MIN_QUERY) resetSuggestions()
				}}
				// A search box, not part of the address being saved — `off` stops the browser offering the
				// customer's own saved street address as a completion for a field that is a query.
				autoComplete="off"
				role="combobox"
				aria-expanded={results.length > 0}
				aria-controls={listId}
				aria-autocomplete="list"
				className="rounded-box border border-slate-300 px-3 py-2 text-sm outline-none focus:border-palette-bg"
				placeholder="Start typing a street and number"
			/>

			{hint !== undefined && <p className="text-xs text-tip">{hint}</p>}

			{/* `aria-live` so the count is announced without moving focus off the input the customer is typing in. */}
			<p aria-live="polite" className="sr-only">
				{busy ? 'Searching' : `${String(results.length)} suggestions`}
			</p>

			{failed && <p className="text-xs text-app-error">The address lookup is unavailable. Fill the fields in below by hand.</p>}

			{results.length > 0 && (
				<ul id={listId} role="listbox" className="mt-1 divide-y divide-slate-200 rounded-box border border-slate-200 bg-white">
					{results.map((address) => (
						<li key={address.id} role="option" aria-selected={false}>
							<button
								type="button"
								onClick={() => {
									pick(address)
								}}
								className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
							>
								{address.label}
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	)
}
