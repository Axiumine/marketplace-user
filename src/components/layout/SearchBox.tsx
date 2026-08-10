import { useNavigate } from '@tanstack/react-router'
import type { SubmitEvent } from 'react'

/**
 * The header search field.
 *
 * ⚠️ It is a real `<form method="get" action="/search">` with a named input, and that matters more than
 * it looks. Rendered server-side, the form works before any JavaScript has loaded and it works if the
 * bundle never loads at all — the browser builds `/search?q=…` from the markup itself. `onSubmit` only
 * upgrades that into a client-side navigation, which keeps the already-loaded shell instead of asking
 * the server for a whole new document.
 *
 * The same property is why a `<button>` that called `navigate()` was not used: a crawler that follows
 * forms, a keyboard visitor pressing Enter, and a visitor on a failed bundle all take the plain HTML
 * path, and each of them gets a working search.
 */
export const SearchBox = ({ initialQuery = '' }: { readonly initialQuery?: string }) => {
	const navigate = useNavigate()

	// React's `SubmitEvent`, not the DOM global of the same name and not `FormEvent`: `@types/react` 19
	// deprecated `FormEvent` ("doesn't actually exist") and types `onSubmit` as `SubmitEventHandler`.
	const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
		event.preventDefault()

		const query = new FormData(event.currentTarget).get('q')
		const text = typeof query === 'string' ? query.trim() : ''

		// An empty search is not sent. `/search?q=` renders an empty state that looks like "nothing
		// matched", which is a different and wrong answer to "the visitor pressed Enter on a blank field".
		if (text === '') return

		void navigate({ to: '/search', search: { q: text } })
	}

	return (
		<form method="get" action="/search" onSubmit={onSubmit} role="search" className="flex w-full max-w-xl items-center gap-2">
			<label htmlFor="site-search" className="sr-only">
				Search shops and items
			</label>
			<input
				id="site-search"
				name="q"
				type="search"
				defaultValue={initialQuery}
				placeholder="Search shops and items"
				autoComplete="off"
				className="w-full rounded-box border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500"
			/>
			<button
				type="submit"
				className="rounded-box bg-palette-bg px-4 py-2 text-sm font-medium text-palette-white hover:bg-palette-bg3"
			>
				Search
			</button>
		</form>
	)
}
