import { Link } from '@tanstack/react-router'

import type { CategoryNode } from '@/lib/categories'

/**
 * The category tree, as navigation.
 *
 * Every subcategory link is rendered, not just the ones under an open parent. The tree is two levels
 * deep and small, and rendering it whole is what makes every category page reachable from every other
 * page — which is the entire point of having it in the markup rather than behind a click. A crawler
 * budgets how deep it will go; a category that is three navigations away tends not to be visited.
 *
 * `activeProps` gives the current category a visual state without this component needing to know which
 * route it is on.
 */
export const CategoryNav = ({ categories }: { readonly categories: readonly CategoryNode[] }) => {
	if (categories.length === 0) return null

	return (
		<nav aria-label="Categories" className="rounded-box border border-slate-200 bg-white p-4">
			<h2 className="mb-3 text-sm font-semibold tracking-wide text-slate-500 uppercase">Categories</h2>
			<ul className="flex flex-col gap-3">
				{categories.map((category) => (
					<li key={category._id}>
						<Link
							to="/category/$slug"
							params={{ slug: category.slug }}
							activeProps={{ className: 'font-semibold' }}
							className="text-sm text-palette-bg hover:underline"
						>
							{category.name}
						</Link>
						{category.children.length > 0 && (
							<ul className="mt-1 ml-3 flex flex-col gap-1 border-l border-slate-200 pl-3">
								{category.children.map((child) => (
									<li key={child._id}>
										<Link
											to="/category/$slug/$childSlug"
											params={{ slug: category.slug, childSlug: child.slug }}
											activeProps={{ className: 'font-semibold' }}
											className="text-sm text-slate-600 hover:underline"
										>
											{child.name}
										</Link>
									</li>
								))}
							</ul>
						)}
					</li>
				))}
			</ul>
		</nav>
	)
}
