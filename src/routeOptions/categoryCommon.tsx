import { redirect } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { ItemCategoriesDocument, ItemsDocument } from '@/api/operations/publicResource/queries'
import { runQuery } from '@/api/run'
import { Breadcrumbs } from '@/features/catalogue/Breadcrumbs'
import { EmptyState } from '@/features/catalogue/EmptyState'
import { ItemGrid } from '@/features/catalogue/ItemGrid'
import { Pagination } from '@/features/catalogue/Pagination'
import type { FlatCategory } from '@/lib/categories'
import { categoryPath, findCategory } from '@/lib/categories'
import type { Crumb } from '@/lib/jsonLd'
import { breadcrumbJsonLd, itemListJsonLd, jsonLdScripts } from '@/lib/jsonLd'
import { offsetOf, PAGE_SIZE, pageLinks, pageNumber } from '@/lib/pagination'
import { absoluteUrl, headFor, truncate } from '@/lib/seo'
import type { RouterContext } from '@/router'

/**
 * Everything `/category/:slug` and `/category/:slug/:childSlug` have in common, which is nearly all of
 * it: the two routes differ only in which segment names the category being shown.
 *
 * They are two route files rather than one optional segment because a route with an optional trailing
 * param cannot express "the first segment must be the parent of the second" — and that check is the
 * whole reason the parent is in the URL at all. Slugs are unique across both levels, so
 * `/category/anything/real-child` resolves the child perfectly well; without the check it would be a
 * second, indexable URL for the same content, mintable in unlimited quantity.
 */

/** A category with no items yet is a real page, not a 404 — the operator created it on purpose. */
export interface CategoryLoaderResult {
	readonly category: FlatCategory
	/**
	 * Absent on a top-level category. `| undefined` spelled out because the loader always sets the key —
	 * it destructures `findCategory`'s result, which answers `undefined` for a top-level hit — and
	 * `exactOptionalPropertyTypes: true` rejects an explicit `undefined` against a bare `?:`.
	 */
	readonly parent?: FlatCategory | undefined
	/** Direct subcategories, ordered. Always empty on a subcategory: the tree is capped at two levels. */
	readonly children: readonly FlatCategory[]
	readonly crumbs: readonly Crumb[]
	readonly items: Awaited<ReturnType<typeof loadItems>>
	readonly page: number
	readonly basePath: string
}

const loadItems = async (context: RouterContext, idCategory: string, page: number) => {
	const data = await runQuery(context.gql, ItemsDocument, {
		idCategory,
		limit: PAGE_SIZE,
		offset: offsetOf(page)
	})

	return data.items
}

/**
 * Resolves the slug, enforces that the URL spells the category's real position, and loads its items.
 *
 * ⚠️ **The redirects are 301, not the router's default 307.** A 307 says "this URL is fine, look over
 * there for now", so a crawler keeps the wrong URL in its index and keeps requesting it. These
 * mismatches are permanent by construction — a child's parent does not change without the child's slug
 * changing too — and 301 is what collapses the duplicate into the canonical one.
 *
 * `notFound()` is thrown by the caller rather than here: the two routes want different behaviour for an
 * unknown slug only in the message, but keeping the throw at the call site keeps this function's return
 * type free of the "or nothing" case.
 */
export const loadCategory = async ({
	context,
	slug,
	page: rawPage
}: {
	context: RouterContext
	slug: string
	page: number
}): Promise<CategoryLoaderResult | undefined> => {
	const page = pageNumber(rawPage)

	const tree = await runQuery(context.gql, ItemCategoriesDocument, {})
	const found = findCategory(tree.itemCategories, slug)
	if (found === undefined) return undefined

	const { category, parent } = found
	const basePath = categoryPath(category.slug, parent?.slug)

	const crumbs: Crumb[] = [
		{ name: 'Home', path: '/' },
		...(parent === undefined ? [] : [{ name: parent.name, path: categoryPath(parent.slug) }]),
		{ name: category.name, path: basePath }
	]

	// Sorted here rather than by the resolver: `position` is the operator's ordering and ties are broken
	// by name with the same `it-IT` collator `nestCategories` uses, so both navigations agree.
	const children = tree.itemCategories
		.filter((candidate) => candidate.idParent === category._id)
		.toSorted((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'it-IT'))

	return { category, parent, children, crumbs, items: await loadItems(context, category._id, page), page, basePath }
}

/**
 * Throws the 301 when the URL's shape does not match where the category actually sits.
 *
 * Both directions are possible from either route: a top-level slug requested with a parent segment in
 * front of it, and a subcategory requested with the wrong parent or with none. `to` + `params` rather
 * than `href`, so the target is a route the type checker knows and the redirect stays an internal
 * navigation instead of a full document load.
 *
 * `redirect({ throw: true })` is deliberately *not* used: the option makes `redirect` throw the object
 * itself, which is exactly what the `throw` in front of the call already does. Passing both is a token
 * no behaviour depends on — flipping it to `false` changed nothing any test could see — so it is the
 * `throw` statement that stays and the option that goes.
 */
export const assertCanonicalCategoryUrl = (result: CategoryLoaderResult, currentPath: string) => {
	if (result.basePath === currentPath) return

	if (result.parent === undefined) {
		throw redirect({ to: '/category/$slug', params: { slug: result.category.slug }, statusCode: 301 })
	}

	throw redirect({
		to: '/category/$slug/$childSlug',
		params: { slug: result.parent.slug, childSlug: result.category.slug },
		statusCode: 301
	})
}

export const categoryHead = (result: CategoryLoaderResult | undefined) => {
	if (result === undefined) return headFor({ title: 'Category', description: '', path: '/shops' })

	const { category, crumbs, items, page, basePath } = result
	const path = page === 1 ? basePath : `${basePath}?page=${String(page)}`

	const seo = headFor({
		title: page === 1 ? category.name : `${category.name} — page ${String(page)}`,
		description: truncate(`Every item published under ${category.name}, from every shop on the platform.`),
		path,
		noIndex: page > 1
	})

	const { prev, next } = pageLinks(basePath, page, items.hasMore)

	return {
		...seo,
		links: [
			...seo.links,
			...(prev === undefined ? [] : [{ rel: 'prev', href: absoluteUrl(prev) }]),
			...(next === undefined ? [] : [{ rel: 'next', href: absoluteUrl(next) }])
		],
		scripts: jsonLdScripts(
			breadcrumbJsonLd(crumbs),
			itemListJsonLd(
				items.nodes.map((item) => `/shop/${item.companySlug}/item/${item.slug}`),
				offsetOf(page)
			)
		)
	}
}

/** The rendered page, identical for both routes. */
export const CategoryView = ({ result, children }: { readonly result: CategoryLoaderResult; readonly children?: ReactNode }) => {
	const { category, crumbs, items, page, basePath } = result
	const { prev, next } = pageLinks(basePath, page, items.hasMore)

	return (
		<div className="mx-auto max-w-6xl px-4 py-8">
			<Breadcrumbs crumbs={crumbs} />

			<h1 className="mt-4 text-3xl font-semibold text-palette-bg">{category.name}</h1>

			{children}

			<div className="mt-6">
				{items.nodes.length === 0 ? (
					<EmptyState title="Nothing published under this category yet" hint="Try another one." />
				) : (
					<ItemGrid items={items.nodes} />
				)}
			</div>

			<Pagination prev={prev} next={next} page={page} />
		</div>
	)
}
