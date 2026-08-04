/**
 * "Nothing here" — for a listing that ran fine and matched nothing.
 *
 * Kept distinct from the error boundary on purpose. An empty result and a failed request look the same
 * to a visitor if both render "no results", and they need opposite reactions: one means try a different
 * search, the other means try again.
 */
export const EmptyState = ({ title, hint }: { readonly title: string; readonly hint?: string }) => (
	<div className="rounded-box border border-dashed border-slate-300 bg-white p-8 text-center">
		<p className="font-medium text-palette-bg">{title}</p>
		{hint !== undefined && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
	</div>
)
