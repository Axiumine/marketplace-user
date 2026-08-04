import type { ShopCardCompany } from './ShopCard'
import { ShopCard } from './ShopCard'

/**
 * The `<ul>` of shop cards, shared by every page that lists shops.
 *
 * A list element and not a run of `<div>`s: the count is announced by a screen reader before the first
 * item, which is the difference between "list, 24 items" and silence. `ShopCard` renders the `<article>`
 * inside each `<li>`.
 *
 * Empty is the caller's problem. Every page that lists shops has its own wording for "nothing here" —
 * a city with no shops is not the same message as a search with no hits — so this component renders an
 * empty list rather than guessing, and each route pairs it with its own `EmptyState`.
 */
export const ShopGrid = ({ companies }: { readonly companies: readonly ShopCardCompany[] }) => (
	<ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
		{companies.map((company) => (
			<li key={company._id}>
				<ShopCard company={company} />
			</li>
		))}
	</ul>
)
