import { Link } from '@tanstack/react-router'

import { formatDistance } from '@/lib/format'
import { truncate } from '@/lib/seo'

export interface ShopCardAddress {
	readonly street: string
	readonly postalCode: string
	readonly city: string
	readonly province: string
}

export interface ShopCardCompany {
	readonly _id: string
	readonly publicName: string
	readonly slug: string
	readonly description?: string | null
	readonly address: ShopCardAddress
}

/**
 * One shop in a listing.
 *
 * The whole card is a `<Link>` rather than a `<div>` with a link inside it. That is a click-target
 * decision on a phone, but it is also a crawler one: a listing page's job is to pass its authority on to
 * the pages it links to, and one anchor per result with the shop's name as its text is what does that.
 *
 * `<article>` and an `<h2>` heading, because a listing is a list of documents — a screen reader can then
 * jump result to result by heading. The heading level is fixed at 2 on purpose: every listing page has
 * exactly one `<h1>`, which is the page title, and letting a card choose its own level is how a page
 * ends up with three `<h1>`s.
 */
export const ShopCard = ({
	company,
	distanceMeters
}: {
	readonly company: ShopCardCompany
	readonly distanceMeters?: number | null
}) => {
	const distance = formatDistance(distanceMeters)

	return (
		<article className="h-full">
			<Link
				to="/shop/$slug"
				params={{ slug: company.slug }}
				className="flex h-full flex-col gap-2 rounded-box border border-slate-200 bg-white p-4 hover:border-slate-400"
			>
				<h2 className="text-base font-semibold text-palette-bg">{company.publicName}</h2>
				<p className="text-sm text-slate-500">
					{company.address.street}, {company.address.postalCode} {company.address.city} ({company.address.province})
				</p>
				{company.description !== undefined && company.description !== null && company.description !== '' && (
					<p className="text-sm text-slate-600">{truncate(company.description, 120)}</p>
				)}
				{distance !== null && <p className="mt-auto text-sm font-medium text-third">{distance} away</p>}
			</Link>
		</article>
	)
}
