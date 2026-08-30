/**
 * The category tree.
 *
 * The resolver answers a flat list because that is what the collection holds — `idParent` absent means
 * a top-level category, present means a subcategory — and the tree is two levels deep by construction:
 * the Admin-tier resolver refuses a category whose parent already has one.
 *
 * Nesting happens here rather than server-side so the whole tree travels as one cached response. It is
 * the site navigation, so every public page needs it.
 */

export interface FlatCategory {
	readonly _id: string
	readonly idParent?: string | null
	readonly name: string
	readonly slug: string
	readonly position: number
}

export interface CategoryNode extends FlatCategory {
	readonly children: readonly CategoryNode[]
}

const byPosition = (a: FlatCategory, b: FlatCategory): number => a.position - b.position || a.name.localeCompare(b.name, 'en-GB')

/**
 * Groups children under their parent, both levels ordered by `position`.
 *
 * ⚠️ A subcategory whose `idParent` names a category that is not in the list is **dropped**, not
 * promoted to the top level. Promoting it would put an orphan in the main navigation, where it reads as
 * a real top-level category; dropping it makes the gap visible in the one place that can fix it. The
 * only way to produce one is a category deleted while its children still point at it, which the Admin
 * tier prevents — so this branch is a guard against a state the database should never reach, not a
 * routine case.
 *
 * `position` ties are broken by name with an `en-GB` collator: the admin UI does not force distinct
 * positions, and without a tiebreak the order of two equal entries depends on the order Mongo happened
 * to return them in, which is not stable between requests.
 */
export const nestCategories = (flat: readonly FlatCategory[]): readonly CategoryNode[] => {
	const tops = flat.filter((category) => category.idParent === undefined || category.idParent === null)

	const childrenOf = (id: string): readonly CategoryNode[] =>
		flat
			.filter((category) => category.idParent === id)
			.sort(byPosition)
			.map((category) => ({ ...category, children: [] }))

	// `tops` and every `childrenOf` result are arrays this function just built, so sorting them in place
	// never reorders the caller's array — which is the urql document cache's, shared with every other
	// component holding that query.
	return tops.sort(byPosition).map((category) => ({ ...category, children: childrenOf(category._id) }))
}

/** The `/category/:slug` or `/category/:parentSlug/:slug` path a category lives at. */
export const categoryPath = (slug: string, parentSlug?: string): string =>
	parentSlug === undefined ? `/category/${slug}` : `/category/${parentSlug}/${slug}`

/**
 * Finds a category by slug, and its parent when it has one.
 *
 * Slugs are unique across the whole collection, not per level, so one lookup is enough — a subcategory
 * URL carries its parent's slug for readability and for the breadcrumb, not to disambiguate. The
 * consequence worth knowing: `/category/wrong-parent/real-child` resolves the child fine, which is why
 * the route options check that the parent in the URL is the real one and redirect when it is not.
 */
export const findCategory = (
	flat: readonly FlatCategory[],
	slug: string
): { readonly category: FlatCategory; readonly parent?: FlatCategory } | undefined => {
	const category = flat.find((candidate) => candidate.slug === slug)
	if (category === undefined) return undefined

	// No `idParent === null` short-circuit before the lookup. `_id` is required and non-null on every
	// category the API can answer with, so a nullish `idParent` matches nothing and the same
	// `{ category }` comes back either way — a branch that changes only how fast the answer is reached
	// is a branch no test can distinguish and no mutant can be killed on.
	const parent = flat.find((candidate) => candidate._id === category.idParent)
	return parent === undefined ? { category } : { category, parent }
}
