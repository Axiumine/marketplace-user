import type { Crumb } from '@/lib/jsonLd'

/**
 * The visible breadcrumb trail.
 *
 * ⚠️ It must list the same crumbs, in the same order, as the `BreadcrumbList` JSON-LD the same route
 * emits. Structured data that describes something the page does not show is a manual-action offence, and
 * the penalty applies to the domain rather than to the page — so route options build one array and pass
 * it to both. Never let these two drift apart.
 *
 * The last crumb is the current page and is rendered as text with `aria-current`, not as a link to
 * itself.
 *
 * Plain `<a href>` rather than `<Link>`, for the same reason `Pagination` uses one: a `Crumb.path` is an
 * already-built string — `categoryPath()` produces it — and `Link`'s `to` is a union of the route tree's
 * literal paths, so passing one would need a cast that turns off the only check `Link` exists to make.
 * An `href` built from the same string the JSON-LD carries is the honest version.
 */
export const Breadcrumbs = ({ crumbs }: { readonly crumbs: readonly Crumb[] }) => (
	<nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-500">
		<ol className="flex flex-wrap items-center gap-1">
			{crumbs.map((crumb, index) => {
				const isLast = index === crumbs.length - 1

				return (
					<li key={crumb.path} className="flex items-center gap-1">
						{index > 0 && <span aria-hidden="true">/</span>}
						{isLast ? (
							<span aria-current="page" className="text-slate-700">
								{crumb.name}
							</span>
						) : (
							<a href={crumb.path} className="hover:underline">
								{crumb.name}
							</a>
						)}
					</li>
				)
			})}
		</ol>
	</nav>
)
