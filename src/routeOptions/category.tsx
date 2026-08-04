import { getRouteApi, Link, notFound } from '@tanstack/react-router'
import { z } from 'zod'

import { categoryPath } from '@/lib/categories'
import { pageNumber } from '@/lib/pagination'
import type { RouterContext } from '@/router'

import type { CategoryLoaderResult } from './categoryCommon'
import { assertCanonicalCategoryUrl, categoryHead, CategoryView, loadCategory } from './categoryCommon'

/**
 * `/category/:slug` — a top-level category, and every item published under it.
 *
 * A subcategory requested here is not a 404: it exists, the URL is merely the short form of it. The
 * loader redirects to `/category/:parentSlug/:slug` with a 301 so the two never compete in an index.
 */
const route = getRouteApi('/category/$slug/')

const searchSchema = z.object({
	page: z.coerce.number().int().min(1).catch(1).optional()
})

export type CategorySearch = z.infer<typeof searchSchema>

const loader = async ({
	context,
	params,
	deps
}: {
	context: RouterContext
	params: { slug: string }
	deps: { page: number }
}): Promise<CategoryLoaderResult> => {
	const result = await loadCategory({ context, slug: params.slug, page: deps.page })
	if (result === undefined) throw notFound()

	assertCanonicalCategoryUrl(result, categoryPath(params.slug))

	return result
}

const head = ({ loaderData }: { loaderData?: CategoryLoaderResult }) => categoryHead(loaderData)

const Category = () => {
	const result = route.useLoaderData()

	return (
		<CategoryView result={result}>
			{/* The subcategories are links, above the items. A top-level category is a hub page and its
			    value to a crawler is what it links out to; burying that under 24 item cards puts it below
			    the point most crawls stop reading. */}
			{result.children.length > 0 && (
				<nav aria-label="Subcategories" className="mt-6">
					<ul className="flex flex-wrap gap-2">
						{result.children.map((child) => (
							<li key={child._id}>
								<Link
									to="/category/$slug/$childSlug"
									params={{ slug: result.category.slug, childSlug: child.slug }}
									className="inline-block rounded-box border border-slate-300 px-3 py-1 text-sm text-slate-700"
								>
									{child.name}
								</Link>
							</li>
						))}
					</ul>
				</nav>
			)}
		</CategoryView>
	)
}

export const categoryRouteOptions = {
	validateSearch: searchSchema,
	loaderDeps: ({ search }: { search: CategorySearch }) => ({ page: pageNumber(search.page) }),
	loader,
	head,
	component: Category
}
