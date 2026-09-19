import type { AnyRouter } from '@tanstack/react-router'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SearchBox } from '@/components/layout/SearchBox'
import type { SearchKind } from '@/lib/search'

import type { GraphQLReplies } from '../../helpers/graphql'
import { stubGraphQL } from '../../helpers/graphql'
import { renderWithRouter } from '../../helpers/render'

const EMPTY_PAGE = { nodes: [], total: 0, totalIsExact: true, hasMore: false }

const REPLIES: GraphQLReplies = {
	Companies: { data: { companies: { nodes: [], total: 0 } } },
	ItemCategories: { data: { itemCategories: [] } },
	SearchCompanies: { data: { searchCompanies: EMPTY_PAGE } },
	SearchItems: { data: { searchItems: EMPTY_PAGE } }
}

const mount = async (initialQuery?: string, kind?: SearchKind) => {
	const stub = stubGraphQL(REPLIES)
	const result = await renderWithRouter(
		<SearchBox {...(initialQuery === undefined ? {} : { initialQuery })} {...(kind === undefined ? {} : { kind })} />
	)

	return { ...result, stub, user: userEvent.setup(), input: screen.getByRole('searchbox') }
}

const at = async (router: AnyRouter, href: string): Promise<void> => {
	await waitFor(() => {
		expect(router.state.location.href).toBe(href)
	})
}

describe('SearchBox markup', () => {
	/*
	 * ⚠️ A real `<form method="get" action="/search">` with a named input, and that is worth more than it
	 * looks. Server-rendered, it works before the bundle has loaded and it works if the bundle never loads
	 * at all — the browser builds `/search?q=…` from the markup itself. `onSubmit` only upgrades that into
	 * a client-side navigation. A `<button>` calling `navigate()` would leave a crawler, a keyboard visitor
	 * and a visitor on a failed bundle with nothing.
	 */
	it('degrades to a plain GET form', async () => {
		const { container } = await mount()
		const form = container.querySelector('form')

		expect(form).toHaveAttribute('method', 'get')
		expect(form).toHaveAttribute('action', '/search')
	})

	// The parameter name is part of that contract: `/search?q=` is what `validateSearch` reads, so a
	// renamed input silently breaks the no-JavaScript path while the hydrated one keeps working.
	it('names the field the way the route reads it', async () => {
		const { input } = await mount()

		expect(input).toHaveAttribute('name', 'q')
	})

	it('is a labelled search landmark', async () => {
		await mount()

		expect(screen.getByRole('search')).toBeInTheDocument()
		expect(screen.getByLabelText('Search shops and items')).toBeInTheDocument()
	})

	// Echoed back so the header on `/search?q=ceramics` shows what was searched for, instead of an empty box
	// above the results it produced.
	it('shows the query it was given', async () => {
		const { input } = await mount('ceramics')

		expect(input).toHaveValue('ceramics')
	})

	it('starts empty when there is no query', async () => {
		const { input } = await mount()

		expect(input).toHaveValue('')
	})

	// The browser's own history of past searches over a field the site already fills from the URL is noise,
	// and on a shared machine it is one visitor's queries offered to the next.
	it('leaves autofill out of it', async () => {
		const { input } = await mount()

		expect(input).toHaveAttribute('autocomplete', 'off')
	})
})

describe('SearchBox submission', () => {
	it('navigates to the search route on the client', async () => {
		const { router, user, input } = await mount()

		await user.type(input, 'ceramics{Enter}')

		await at(router, '/search?q=ceramics')
	})

	// Trimmed, because ` ceramics ` and `ceramics` are the same search and would otherwise be two URLs
	// competing for the same result set — and the backend text index would see the padding as part of it.
	it('trims the query before it reaches the URL', async () => {
		const { router, user, input } = await mount()

		await user.type(input, '   ceramics   {Enter}')

		await at(router, '/search?q=ceramics')
	})

	/*
	 * ⚠️ An empty search is not sent. `/search?q=` renders an empty state that reads as "nothing matched",
	 * which is a different and wrong answer to "the visitor pressed Enter on a blank field" — and it is a
	 * text search for the empty string, which on a Mongo text index is a full scan.
	 */
	it('sends nothing when the field is blank', async () => {
		const { router, user, input } = await mount()

		await user.type(input, '{Enter}')

		expect(router.state.location.href).toBe('/')
		expect(input).toHaveFocus()
	})

	it('sends nothing when the field holds only whitespace', async () => {
		const { router, user, input } = await mount()

		await user.type(input, '    {Enter}')

		expect(router.state.location.href).toBe('/')
	})

	/*
	 * ⚠️ `FormData.get('q')` answers `null` when the field is not in the form, and `File` when something
	 * else put a file input under that name — neither is a query. A form arriving here without its field is
	 * not hypothetical: a disabled input is left out of `FormData` by the browser itself, and an extension
	 * that rewrites the header is enough to remove it outright.
	 *
	 * The wrong handling is `String(query)`, which turns the missing field into the literal `"null"` and
	 * sends a visitor to `/search?q=null`.
	 */
	it('sends nothing when the field is not in the form at all', async () => {
		const { container, router, input } = await mount()
		const form = container.querySelector('form')
		const onWindowError = vi.fn()
		window.addEventListener('error', onWindowError)

		input.remove()
		fireEvent.submit(form as HTMLFormElement)

		window.removeEventListener('error', onWindowError)
		expect(onWindowError).not.toHaveBeenCalled()
		expect(router.state.location.href).toBe('/')
	})

	// Clicking the button and pressing Enter are the same path — both submit the form, and both are
	// intercepted by the one `onSubmit`.
	it('submits from the button too', async () => {
		const { router, user, input } = await mount()

		await user.type(input, 'ceramics')
		await user.click(screen.getByRole('button', { name: 'Search' }))

		await at(router, '/search?q=ceramics')
	})

	// The default is a full document request to `/search`. Letting it through would throw away the loaded
	// shell and ask the SSR server for a page the client already has.
	it('keeps the loaded shell instead of asking for a new document', async () => {
		const { user, input } = await mount()
		const submitted = vi.fn()
		window.addEventListener('submit', submitted)

		await user.type(input, 'ceramics{Enter}')

		expect(submitted.mock.calls[0]?.[0].defaultPrevented).toBe(true)
		window.removeEventListener('submit', submitted)
	})
})

/*
 * ⚠️ The kind travels on both paths at once — the hidden field the browser submits with no JavaScript, and
 * the `search` object the router navigates with — and on neither when it is the default. A box that drops
 * it throws a visitor retyping a query from the shops tab back onto items; a box that always writes it
 * gives the default tab a second address for the same page.
 */
describe('SearchBox kind', () => {
	it('carries a non-default kind in a hidden field', async () => {
		const { container } = await mount('ceramics', 'companies')

		expect(container.querySelector('input[name="kind"]')).toHaveAttribute('value', 'companies')
	})

	it.each([[undefined], ['items' as const]])('writes no field for the default kind: %s', async (kind) => {
		const { container } = await mount('ceramics', kind)

		expect(container.querySelector('input[name="kind"]')).toBeNull()
	})

	it('keeps the kind in the URL it navigates to', async () => {
		const { router, user, input } = await mount('', 'companies')

		await user.type(input, 'ceramics{Enter}')

		await at(router, '/search?q=ceramics&kind=companies')
	})

	it('leaves the default kind out of the URL it navigates to', async () => {
		const { router, user, input } = await mount('', 'items')

		await user.type(input, 'ceramics{Enter}')

		await at(router, '/search?q=ceramics')
	})
})

describe('SearchBox snapshot', () => {
	it('renders', async () => {
		await mount('ceramics')

		expect(screen.getByRole('search')).toMatchSnapshot()
	})
})
