import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete'

import type { ResponseOsm } from '../../helpers/nominatim'
import { installOsm, resultOsm } from '../../helpers/nominatim'

/** The component waits this long after the last keystroke before it asks the geocoder anything. */
const DEBOUNCE_MS = 350

const MAIN_STREET = resultOsm()
const OAK_STREET = resultOsm({
	place_id: 240109190,
	display_name: 'Oak Street, 5, Boston, MA, 02108, USA',
	address: { ...MAIN_STREET.address, road: 'Oak Street', house_number: '5' }
})

/*
 * ⚠️ Real timers, deliberately, and the reason is worth writing down because fake ones are the obvious
 * first attempt: `user.type` puts an internal `setTimeout` between keystrokes, and under `vi.useFakeTimers()`
 * nothing advances it — every typing test then dies on vitest's 5 s timeout instead of on an assertion,
 * which reads as a component bug rather than as a harness one. `delay: null` does not help either; the
 * pacing is not the only timer userEvent schedules.
 *
 * The cost is the debounce itself, 350 ms per search, and it is paid honestly.
 */
const setup = (replies: ResponseOsm | readonly ResponseOsm[] = { results: [MAIN_STREET] }) => {
	const osm = installOsm(replies)
	const onPick = vi.fn()
	const user = userEvent.setup()

	const { unmount } = render(<AddressAutocomplete label="Search for an address" onPick={onPick} />)

	return { osm, onPick, unmount, user, input: screen.getByRole('combobox') }
}

/** Waits until the geocoder has been asked exactly `count` times. */
const asked = async (osm: { readonly calls: readonly string[] }, count: number): Promise<void> => {
	await waitFor(() => {
		expect(osm.calls).toHaveLength(count)
	})
}

/**
 * Waits past the debounce so an "asks nothing" assertion is about a request that was never made rather
 * than about one that had not been made *yet* — the difference between a real guard and a slow test.
 */
const past = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS * 2))

describe('the address search box', () => {
	it('labels the input', () => {
		setup()

		expect(screen.getByLabelText('Search for an address')).toBe(screen.getByRole('combobox'))
	})

	it('is a combobox that says its list is closed', () => {
		const { input } = setup()

		expect(input).toHaveAttribute('aria-expanded', 'false')
		expect(input).toHaveAttribute('aria-autocomplete', 'list')
	})

	/*
	 * `autoComplete="off"` because this box is a *query*, not a field being saved. Left on, the browser
	 * offers the customer's own saved street address as a completion for it, which then gets geocoded.
	 */
	it('keeps the browser from completing a search box', () => {
		const { input } = setup()

		expect(input).toHaveAttribute('autocomplete', 'off')
	})

	it('shows a hint when it has one', () => {
		render(<AddressAutocomplete label="Search" hint="Street and number" onPick={vi.fn()} />)

		expect(screen.getByText('Street and number')).toBeInTheDocument()
	})

	/*
	 * Absent, not present and empty. A `<p>` rendered unconditionally with nothing in it still passes a
	 * "the hint text is not there" assertion, while leaving a stray gap under every field that has no hint.
	 */
	it('shows no hint when it has none', () => {
		setup()

		expect(screen.queryByText('Street and number')).not.toBeInTheDocument()
		expect(document.querySelector('p.text-tip')).toBeNull()
	})

	/*
	 * The list is wired to the box by id, and the id has to be a real one: `aria-controls` pointing at
	 * nothing is worse than no `aria-controls` at all — a screen reader announces a controlled element that
	 * does not exist, and the suggestions it is meant to reach are never offered.
	 */
	it('points the combobox at the list it will open', async () => {
		const { user, input } = setup()
		const listId = input.getAttribute('aria-controls')

		expect(listId).not.toBe('')
		expect(listId).not.toBeNull()

		await user.type(input, 'Oak')

		expect(await screen.findByRole('listbox')).toHaveAttribute('id', listId as string)
	})

	// Nothing has been searched for yet, so neither the busy announcement nor the failure message belongs
	// on screen — a field that opens already saying "Searching" is a field nobody trusts.
	it('starts idle, with nothing announced and nothing failed', () => {
		setup()

		expect(screen.getByText('0 suggestions')).toBeInTheDocument()
		expect(screen.queryByText(/lookup is unavailable/)).not.toBeInTheDocument()
	})
})

describe('when to ask the geocoder', () => {
	/*
	 * ⚠️ Below three characters the query matches half the country and the lookup is the expensive part —
	 * Nominatim answers a full-text query against a PostgreSQL index, and it is the slowest thing this app
	 * talks to.
	 */
	it('asks nothing for a query too short to mean anything', async () => {
		const { osm, user, input } = setup()

		await user.type(input, 'Vi')
		await past()

		expect(osm.calls).toHaveLength(0)
	})

	it('asks once the query is long enough', async () => {
		const { osm, user, input } = setup()

		await user.type(input, 'Oak')

		await asked(osm, 1)
	})

	it('ignores surrounding whitespace when measuring the query', async () => {
		const { osm, user, input } = setup()

		await user.type(input, '  Vi  ')
		await past()

		expect(osm.calls).toHaveLength(0)
	})

	it('sends the trimmed query', async () => {
		const { osm, user, input } = setup()

		await user.type(input, '  Main Street  ')
		await asked(osm, 1)

		// `URLSearchParams` spells a space `+`, not `%20`. Both are legal in a query string and Nominatim
		// reads either; the assertion has to match what was actually sent.
		expect(osm.calls[0]).toContain('q=Main+Street')
	})

	/*
	 * The debounce. Without it every keystroke is a request — not a billing problem for a geocoder on our
	 * own hardware, but a CPU one, and one request per character of a street name is a lot of them.
	 */
	it('sends one request for a burst of keystrokes, not one each', async () => {
		const { osm, user, input } = setup()

		await user.type(input, 'Main Street')
		await asked(osm, 1)
		await past()

		expect(osm.calls).toHaveLength(1)
	})

	it('asks again after a second pause', async () => {
		const { osm, user, input } = setup()

		await user.type(input, 'Oak')
		await asked(osm, 1)

		await user.type(input, ' Street')
		await asked(osm, 2)
	})
})

describe('the suggestions', () => {
	it('lists what the geocoder found', async () => {
		const { user, input } = setup({ results: [MAIN_STREET, OAK_STREET] })

		await user.type(input, 'Oak')

		expect(await screen.findByRole('listbox')).toBeInTheDocument()
		expect(screen.getAllByRole('option')).toHaveLength(2)
	})

	it('opens the combobox when there is something to show', async () => {
		const { user, input } = setup()

		await user.type(input, 'Oak')
		await screen.findByRole('listbox')

		expect(input).toHaveAttribute('aria-expanded', 'true')
	})

	it('shows no list when nothing matched', async () => {
		const { osm, user, input } = setup({ results: [] })

		await user.type(input, 'Oak')
		await asked(osm, 1)

		expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
	})

	// The count is announced without moving focus off the box the customer is typing in — a list that
	// appears silently is a list a screen reader user never learns about.
	it('announces how many suggestions there are', async () => {
		const { user, input } = setup({ results: [MAIN_STREET, OAK_STREET] })

		await user.type(input, 'Oak')

		expect(await screen.findByText('2 suggestions')).toBeInTheDocument()
	})

	/*
	 * Nothing in the list is chosen until the customer clicks one, and `aria-selected="true"` on every row
	 * is how a listbox says "all of these are". A screen reader reads the selected state out with each
	 * option, so the mistake turns a list of five addresses into five addresses that all claim to be the
	 * answer.
	 */
	it('marks no suggestion as the selected one', async () => {
		const { user, input } = setup({ results: [MAIN_STREET, OAK_STREET] })

		await user.type(input, 'Oak')
		await screen.findByRole('listbox')

		for (const option of screen.getAllByRole('option')) expect(option).toHaveAttribute('aria-selected', 'false')
	})

	it('announces that it is searching while the request is in flight', async () => {
		const { user, input } = setup({ pending: true })

		await user.type(input, 'Oak')

		expect(await screen.findByText('Searching')).toBeInTheDocument()
	})
})

describe('picking a suggestion', () => {
	const pick = async () => {
		const context = setup({ results: [MAIN_STREET] })

		await context.user.type(context.input, 'Oak')
		await context.user.click(await screen.findByRole('button', { name: MAIN_STREET.display_name }))

		return context
	}

	/*
	 * It fills the form; it is not part of it. The real street, postal code, city, province and coordinate
	 * fields stay visible and editable, because OSM does not know every address — a form only completable
	 * by the geocoder cannot accept a new building or a rural one.
	 */
	it('hands the parsed address to the form', async () => {
		const { onPick } = await pick()

		expect(onPick).toHaveBeenCalledWith({
			id: '240109189',
			label: MAIN_STREET.display_name,
			street: '1 Main Street',
			postalCode: '02108',
			city: 'Boston',
			province: 'MA',
			lat: 42.3601,
			lon: -71.0589
		})
	})

	it('writes the chosen address back into the box', async () => {
		const { input } = await pick()

		expect(input).toHaveValue(MAIN_STREET.display_name)
	})

	it('closes the list', async () => {
		const { input } = await pick()

		expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
		expect(input).toHaveAttribute('aria-expanded', 'false')
	})

	/*
	 * ⚠️ And does not search for what it just wrote. Writing the label back changes the query, which
	 * re-runs the effect and would reopen the list under the cursor showing the thing that was just
	 * chosen — the `skip` ref exists for this and nothing else.
	 */
	it('does not search again for the address it just filled in', async () => {
		const { osm } = await pick()

		await past()

		expect(osm.calls).toHaveLength(1)
	})

	// And typing after a pick searches again — the suppression is for one render, not permanent.
	it('searches again once the customer edits the box', async () => {
		const { osm, user, input } = await pick()

		await user.type(input, 'x')

		await asked(osm, 2)
	})
})

describe('clearing the box', () => {
	it('drops the suggestions', async () => {
		const { user, input } = setup()

		await user.type(input, 'Oak')
		await screen.findByRole('listbox')

		await user.clear(input)

		expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
	})

	/*
	 * ⚠️ Cleared from the change handler, never from the effect. `react-hooks/set-state-in-effect` rejects
	 * a synchronous `setState` in an effect body and the eslint gate is an error, not a warning — and the
	 * handler is the more honest place anyway: the query only falls back under three characters because
	 * somebody typed.
	 *
	 * `busy` is the half that is easy to miss. The effect's cleanup aborts, which makes `.finally` skip
	 * its `setBusy(false)` on purpose — a newer search owns the flag by then — but an emptied box has no
	 * newer search to hand it to, and the live region would go on announcing "Searching" forever.
	 */
	it('stops announcing a search that has nothing left to search for', async () => {
		const { user, input } = setup({ pending: true })

		await user.type(input, 'Oak')
		await screen.findByText('Searching')

		await user.clear(input)

		expect(screen.getByText('0 suggestions')).toBeInTheDocument()
	})

	/*
	 * ⚠️ Exactly `MIN_QUERY` characters left, which is still a query — the guard is `<`, and `<=` would
	 * throw away the list on the boundary keystroke and then rebuild it 350 ms later from the search the
	 * same keystroke scheduled. The suggestions would blink on every backspace to three characters, which
	 * reads as a flaky component rather than as an off-by-one.
	 */
	it('keeps the suggestions when a deletion leaves the query still long enough', async () => {
		const { user, input } = setup([{ results: [MAIN_STREET] }, { results: [MAIN_STREET] }])

		await user.type(input, 'Vial')
		await screen.findByRole('listbox')

		await user.keyboard('{Backspace}')

		expect(screen.getByRole('listbox')).toBeInTheDocument()
	})

	/*
	 * ⚠️ Three characters of whitespace: long enough to pass a raw `length` test and empty as a query. The
	 * effect measures the trimmed length too, so it never asks the geocoder anything — which means without
	 * the trim here the previous search's suggestions stay under an empty box with nothing on the way to
	 * replace them, and picking one fills the form with an address the customer can no longer see the
	 * search for.
	 *
	 * Pasted rather than typed, because each keystroke is its own change event: typing three spaces would
	 * pass through `' '` and `'  '` first, and those clear the list on any reading of the guard.
	 */
	it('treats a box holding only whitespace as an emptied one', async () => {
		const { user, input } = setup()

		await user.type(input, 'Oak')
		await screen.findByRole('listbox')

		await user.tripleClick(input)
		await user.paste('   ')

		expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
	})

	it('clears a failure message too', async () => {
		const { user, input } = setup({ status: 503 })

		await user.type(input, 'Oak')
		await screen.findByText(/lookup is unavailable/)

		await user.clear(input)

		expect(screen.queryByText(/lookup is unavailable/)).not.toBeInTheDocument()
	})
})

describe('when the geocoder does not answer', () => {
	it('says so and points the customer at the fields below', async () => {
		const { user, input } = setup({ status: 503 })

		await user.type(input, 'Oak')

		expect(await screen.findByText(/Fill the fields in below by hand/)).toBeInTheDocument()
	})

	it('shows no stale suggestions alongside the failure', async () => {
		const { user, input } = setup([{ results: [MAIN_STREET] }, { status: 503 }])

		await user.type(input, 'Oak')
		await screen.findByRole('listbox')

		await user.type(input, ' Street')
		await screen.findByText(/Fill the fields in below by hand/)

		expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
	})

	it('clears the failure once a later search succeeds', async () => {
		const { user, input } = setup([{ status: 503 }, { results: [MAIN_STREET] }])

		await user.type(input, 'Oak')
		await screen.findByText(/Fill the fields in below by hand/)

		await user.type(input, ' Street')
		await screen.findByRole('listbox')

		expect(screen.queryByText(/Fill the fields in below by hand/)).not.toBeInTheDocument()
	})
})

describe('the abort', () => {
	/*
	 * ⚠️ Not an optimisation. Somebody types faster than the network answers, so several requests are in
	 * flight and they do not come back in order — an earlier one landing after a later one replaces the
	 * good suggestions with stale ones, and the list then disagrees with the text in the box. The first
	 * fixture answers slowly on purpose: without the abort it would overwrite the second one's results.
	 */
	it('abandons a request the next keystroke superseded', async () => {
		const { osm, user, input } = setup([{ results: [MAIN_STREET], delay: 600 }, { results: [OAK_STREET] }])

		// Awaited between the two, or the debounce collapses them into one request and there is nothing to
		// supersede.
		await user.type(input, 'Oak')
		await asked(osm, 1)
		await user.type(input, ' Oak')

		expect(await screen.findByRole('button', { name: OAK_STREET.display_name })).toBeInTheDocument()

		await past()

		expect(screen.queryByRole('button', { name: MAIN_STREET.display_name })).not.toBeInTheDocument()
	})

	/*
	 * An abort lands in the same `catch` as a real failure, and reporting it as one would flash the error
	 * message on every fast typist's screen. `signal.aborted` is the only way to tell them apart.
	 */
	it('does not report an abandoned request as a failure', async () => {
		const { osm, user, input } = setup([{ pending: true }, { results: [OAK_STREET] }])

		await user.type(input, 'Oak')
		await asked(osm, 1)
		await user.type(input, ' Oak')
		await screen.findByRole('listbox')

		expect(screen.queryByText(/lookup is unavailable/)).not.toBeInTheDocument()
	})

	/*
	 * ⚠️ The same guard as the test above, on the one path where nothing comes along afterwards to hide a
	 * mistake. Superseding a request with another one schedules a fresh search, and that search begins by
	 * clearing the failure flag — so a wrongly-reported abort is wiped 350 ms later and the assertion above
	 * passes either way. Emptying the box aborts with no successor: the query is too short to search for,
	 * nothing clears the flag again, and a mistake here stays on screen.
	 */
	it('does not report an abandoned request as a failure when nothing follows it', async () => {
		const { osm, user, input } = setup({ pending: true })

		await user.type(input, 'Oak')
		await asked(osm, 1)
		await user.clear(input)
		await past()

		expect(screen.queryByText(/lookup is unavailable/)).not.toBeInTheDocument()
	})

	/*
	 * The abort's `.finally` must leave `busy` alone, and this is the window where that is visible: between
	 * the keystroke that aborted and the debounce that starts the replacement, the superseded request is the
	 * only one that has settled. Clearing the flag there would blank the live region for a third of a second
	 * on every keystroke of a fast typist — announcing "0 suggestions" for a search that is still going.
	 */
	it('leaves the search announcement standing when a keystroke supersedes the request', async () => {
		const { osm, user, input } = setup([{ pending: true }, { pending: true }])

		await user.type(input, 'Oak')
		await asked(osm, 1)
		await screen.findByText('Searching')

		await user.type(input, ' Oak')

		expect(screen.getByText('Searching')).toBeInTheDocument()
	})

	/*
	 * The unmount cleanup aborts too. Without it a request in flight would land on a component that is
	 * gone and call `setResults` on it — and under a request that never settles the whole closure stays
	 * alive for as long as the tab is open.
	 */
	it('abandons a request when the field unmounts', async () => {
		const { osm, user, input, unmount } = setup({ pending: true })

		await user.type(input, 'Oak')
		await asked(osm, 1)

		expect(() => {
			unmount()
		}).not.toThrow()
	})
})

describe('the address search box snapshot', () => {
	it('renders idle, with nothing found yet', () => {
		const { container } = render(<AddressAutocomplete label="Search for an address" onPick={vi.fn()} />)

		expect(container.firstChild).toMatchSnapshot()
	})

	it('renders the open list of suggestions', async () => {
		installOsm({ results: [MAIN_STREET, OAK_STREET] })
		const user = userEvent.setup()
		const { container } = render(<AddressAutocomplete label="Search for an address" onPick={vi.fn()} />)

		await user.type(screen.getByRole('combobox'), 'Oak')
		await screen.findByRole('listbox')

		expect(container.firstChild).toMatchSnapshot()
	})
})
