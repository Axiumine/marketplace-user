import { getRouteApi, notFound } from '@tanstack/react-router'
import { z } from 'zod'

import { categoryPath } from '@/lib/categories'
import { pageNumber } from '@/lib/pagination'
import type { RouterContext } from '@/router'

import type { CategoryLoaderResult } from './categoryCommon'
import { assertCanonicalCategoryUrl, categoryHead, CategoryView, loadCategory } from './categoryCommon'

/**
 * `/category/:slug/:childSlug` — a subcategory, with its parent named in the URL.
 *
 * ⚠️ **The child slug is the one that resolves; the parent segment is checked, not used.** Slugs are
 * unique across the whole collection, so `/category/anything/real-child` would render perfectly well —
 * which is exactly why the loader compares the URL it was given against the category's real position and
 * 301s when they disagree. Without that check every subcategory would have as many working URLs as there
 * are category slugs, all indexable, all with identical content.
 */
const route = getRouteApi('/category/$slug/$childSlug')

const searchSchema = z.object({
	page: z.coerce.number().int().min(1).catch(1).optional()
})

export type CategoryChildSearch = z.infer<typeof searchSchema>

const loader = async ({
	context,
	params,
	deps
}: {
	context: RouterContext
	params: { slug: string; childSlug: string }
	deps: { page: number }
}): Promise<CategoryLoaderResult> => {
	const result = await loadCategory({ context, slug: params.childSlug, page: deps.page })
	if (result === undefined) throw notFound()

	assertCanonicalCategoryUrl(result, categoryPath(params.childSlug, params.slug))

	return result
}

const head = ({ loaderData }: { loaderData?: CategoryLoaderResult }) => categoryHead(loaderData)

const CategoryChild = () => <CategoryView result={route.useLoaderData()} />

export const categoryChildRouteOptions = {
	validateSearch: searchSchema,
	loaderDeps: ({ search }: { search: CategoryChildSearch }) => ({ page: pageNumber(search.page) }),
	loader,
	head,
	component: CategoryChild
}
