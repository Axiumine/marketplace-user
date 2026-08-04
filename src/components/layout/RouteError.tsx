import type { ErrorComponentProps } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'

import { visitorMessageOf } from '@/api/errors'

/**
 * The router's `defaultErrorComponent` — a loader or a component threw.
 *
 * ⚠️ The raw error is **not** rendered. On the server this component runs inside the SSR pass, so
 * whatever it prints ends up in HTML served to an anonymous visitor: a urql `CombinedError` carries the
 * upstream URL and, on a network failure, the internal `127.0.0.1:4027` address of the resource service.
 * `visitorMessageOf` maps to the same vocabulary the rest of the app uses and nothing else reaches the
 * page — and it also survives a plain `Error`, which is what the boundary is actually typed to receive.
 *
 * `reset` is offered because most failures here are a transient upstream, and a reload of the whole
 * document is a worse answer than re-running one loader.
 */
export const RouteError = ({ error, reset }: ErrorComponentProps) => (
	<main className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-24">
		<h1 className="text-3xl font-semibold text-slate-900">Something went wrong</h1>
		<p className="text-slate-600">{visitorMessageOf(error)}</p>
		<div className="flex gap-3">
			<button
				type="button"
				onClick={reset}
				className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
			>
				Try again
			</button>
			<Link to="/" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
				Back to the home page
			</Link>
		</div>
	</main>
)
