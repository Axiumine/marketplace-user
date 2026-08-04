import { Link } from '@tanstack/react-router'

import { truncate } from '@/lib/seo'

export interface ItemCardItem {
	readonly _id: string
	readonly name: string
	readonly description: string
	readonly slug: string
	readonly companySlug: string
	readonly companyPublicName: string
}

/**
 * One item in a listing.
 *
 * The shop's name is rendered as text inside the same anchor rather than as a nested `<Link>` to the
 * shop. Nesting an anchor inside an anchor is invalid HTML — browsers recover by closing the outer one
 * early, which silently truncates the card's click target — and the shop page is one click away from the
 * item page anyway.
 */
export const ItemCard = ({ item }: { readonly item: ItemCardItem }) => (
	<article className="h-full">
		<Link
			to="/shop/$slug/item/$itemSlug"
			params={{ slug: item.companySlug, itemSlug: item.slug }}
			className="flex h-full flex-col gap-2 rounded-box border border-slate-200 bg-white p-4 hover:border-slate-400"
		>
			<h2 className="text-base font-semibold text-palette-bg">{item.name}</h2>
			<p className="text-sm text-slate-500">{item.companyPublicName}</p>
			<p className="text-sm text-slate-600">{truncate(item.description, 120)}</p>
		</Link>
	</article>
)
