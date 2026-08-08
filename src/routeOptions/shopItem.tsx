import { getRouteApi, Link, notFound } from '@tanstack/react-router'

import { ItemBySlugDocument } from '@/api/operations/publicResource/queries'
import { runQuery } from '@/api/run'
import { Breadcrumbs } from '@/features/catalogue/Breadcrumbs'
import { breadcrumbJsonLd, jsonLdScripts, productJsonLd } from '@/lib/jsonLd'
import { headFor, truncate } from '@/lib/seo'
import type { RouterContext } from '@/router'

/**
 * `/shop/:slug/item/:itemSlug` — one item.
 *
 * The URL nests the item under its shop because the slug is only unique *per company*: the backend's
 * unique index is `{idCompany, slug}`, so `/item/:slug` on its own could not resolve. That is also why
 * the query takes both segments.
 *
 * The `Product` markup here carries **no `offers` block**, and that is correct rather than incomplete —
 * `item` has no price, because cart and payment are out of scope. A fabricated price would be marked-up
 * data the page does not show, which is the one thing structured-data guidelines treat as a penalty
 * rather than a miss.
 */
const route = getRouteApi('/shop/$slug/item/$itemSlug')

/** The canonical path of one item. The slug is unique per company, so both segments are load-bearing. */
const itemPath = (item: { readonly companySlug: string; readonly slug: string }) => `/shop/${item.companySlug}/item/${item.slug}`

/**
 * The trail, written once and read twice — by the `BreadcrumbList` in the head and by the `<nav>` in the
 * page. `Breadcrumbs` says in its own header that the two must agree; the way to make them agree is not
 * to have two lists. Duplicating them is how a route tells a crawler one path and a visitor another.
 */
const crumbsFor = (item: {
	readonly name: string
	readonly slug: string
	readonly companySlug: string
	readonly companyPublicName: string
}) => [
	{ name: 'Home', path: '/' },
	{ name: 'Shops', path: '/shops' },
	{ name: item.companyPublicName, path: `/shop/${item.companySlug}` },
	{ name: item.name, path: itemPath(item) }
]

const loader = async ({ context, params }: { context: RouterContext; params: { slug: string; itemSlug: string } }) => {
	const data = await runQuery(context.gql, ItemBySlugDocument, {
		companySlug: params.slug,
		slug: params.itemSlug
	})

	const item = data.itemBySlug
	if (item === null || item === undefined) throw notFound()

	return { item }
}

type LoaderData = Awaited<ReturnType<typeof loader>>

const head = ({ loaderData }: { loaderData?: LoaderData }) => {
	const item = loaderData?.item
	if (item === undefined) return headFor({ title: 'Item', description: '', path: '/shops' })

	return {
		...headFor({
			// The shop's name is in the title because an item name on its own ("Blue shirt", "Walnut table")
			// is not a query anyone types, and the pair is.
			title: `${item.name} — ${item.companyPublicName}`,
			description: truncate(item.description),
			path: itemPath(item)
		}),
		scripts: jsonLdScripts(productJsonLd(item), breadcrumbJsonLd(crumbsFor(item)))
	}
}

const ShopItem = () => {
	const { item } = route.useLoaderData()

	return (
		<div className="mx-auto max-w-3xl px-4 py-8">
			<Breadcrumbs crumbs={crumbsFor(item)} />

			<h1 className="mt-4 text-3xl font-semibold text-palette-bg">{item.name}</h1>

			<p className="mt-2 text-slate-600">
				Sold by{' '}
				<Link to="/shop/$slug" params={{ slug: item.companySlug }} className="underline">
					{item.companyPublicName}
				</Link>
			</p>

			{/* `whitespace-pre-line` because the description is free text a shop owner typed, and the line
			    breaks they put in it are the only formatting the field can carry. */}
			<p className="mt-6 whitespace-pre-line text-slate-700">{item.description}</p>
		</div>
	)
}

export const shopItemRouteOptions = { loader, head, component: ShopItem }
