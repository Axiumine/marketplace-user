import type { ItemCardItem } from './ItemCard'
import { ItemCard } from './ItemCard'

/** The `<ul>` of item cards, shared by the shop page, the category pages and the search results. */
export const ItemGrid = ({ items }: { readonly items: readonly ItemCardItem[] }) => (
	<ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
		{items.map((item) => (
			<li key={item._id}>
				<ItemCard item={item} />
			</li>
		))}
	</ul>
)
