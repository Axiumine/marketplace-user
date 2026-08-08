import { describe, expect, it } from 'vitest'

import type { FlatCategory } from '@/lib/categories'
import { categoryPath, findCategory, nestCategories } from '@/lib/categories'

const category = (over: Partial<FlatCategory> & Pick<FlatCategory, '_id' | 'name' | 'slug'>): FlatCategory => ({
	position: 0,
	...over
})

const BAGS = category({ _id: 'c1', name: 'Bags', slug: 'bags', position: 1 })
const DRINKS = category({ _id: 'c2', name: 'Drinks', slug: 'drinks', position: 2 })
const SATCHELS = category({ _id: 'c3', name: 'Satchels', slug: 'satchels', position: 1, idParent: 'c1' })
const TOTES = category({ _id: 'c4', name: 'Totes', slug: 'totes', position: 2, idParent: 'c1' })

describe('nestCategories', () => {
	it('hangs each subcategory under its parent', () => {
		const tree = nestCategories([SATCHELS, BAGS, TOTES, DRINKS])

		expect(tree.map((node) => node.slug)).toEqual(['bags', 'drinks'])
		expect(tree[0]?.children.map((node) => node.slug)).toEqual(['satchels', 'totes'])
		expect(tree[1]?.children).toEqual([])
	})

	// Two levels by construction — the Admin-tier resolver refuses a parent that already has one — so a
	// grandchild is not something the tree has to represent, and every node's children are leaves.
	it('leaves every subcategory childless', () => {
		const tree = nestCategories([BAGS, SATCHELS])

		expect(tree[0]?.children[0]?.children).toEqual([])
	})

	it('orders both levels by position rather than by the order the resolver answered in', () => {
		const tree = nestCategories([DRINKS, TOTES, BAGS, SATCHELS])

		expect(tree.map((node) => node.name)).toEqual(['Bags', 'Drinks'])
		expect(tree[0]?.children.map((node) => node.name)).toEqual(['Satchels', 'Totes'])
	})

	/*
	 * The operator UI does not force distinct positions, and Mongo's answer order for two equal ones is
	 * not stable between requests — so without a tiebreak the navigation reshuffles itself at random.
	 * `en-GB` rather than the default collation because the default sorts every accented letter after
	 * `z`: `Àprons` would come after `Zippers`.
	 */
	it('breaks a position tie by name, with a locale collator', () => {
		const zippers = category({ _id: 'z', name: 'Zippers', slug: 'zippers', position: 5 })
		const aprons = category({ _id: 'a', name: 'Àprons', slug: 'aprons', position: 5 })

		expect(nestCategories([zippers, aprons]).map((node) => node.name)).toEqual(['Àprons', 'Zippers'])
	})

	it('breaks a position tie between two subcategories of the same parent', () => {
		const b = category({ _id: 'x1', name: 'White', slug: 'white', position: 1, idParent: 'c1' })
		const a = category({ _id: 'x2', name: 'Àzure', slug: 'azure', position: 1, idParent: 'c1' })

		expect(nestCategories([BAGS, b, a])[0]?.children.map((node) => node.name)).toEqual(['Àzure', 'White'])
	})

	// `idParent` is optional on the type and nullable on the wire — the resolver answers `null` for a
	// top-level category rather than omitting the key — so both spellings have to mean the same thing.
	it.each<[string, Partial<FlatCategory>]>([
		['an absent idParent', {}],
		['a null idParent', { idParent: null }]
	])('treats %s as top level', (_label, parent) => {
		// Spread rather than `idParent: undefined`: `exactOptionalPropertyTypes` makes an explicit `undefined`
		// a different thing from an absent key, which is exactly the difference these two cases are about.
		const top = category({ _id: 't', name: 'Top', slug: 'top', ...parent })

		expect(nestCategories([top]).map((node) => node.slug)).toEqual(['top'])
	})

	/*
	 * ⚠️ Dropped, not promoted. Promoting an orphan puts it in the main navigation looking like a real
	 * top-level category, where nobody notices it is wrong; dropping it makes the gap visible to the one
	 * person who can fix the data. The only way to reach this state is deleting a category while its
	 * children still point at it, which the Admin tier prevents.
	 */
	it('drops a subcategory whose parent is not in the list', () => {
		const orphan = category({ _id: 'o', name: 'Orphan', slug: 'orphan', idParent: 'gone' })

		expect(nestCategories([BAGS, orphan]).map((node) => node.slug)).toEqual(['bags'])
	})

	it('answers an empty tree for an empty list', () => {
		expect(nestCategories([])).toEqual([])
	})

	// The input is what a loader got back from urql, which hands out its cached array. Sorting it in
	// place would reorder the cache entry every other page holds a reference to.
	it('does not reorder the array it was given', () => {
		const flat = [DRINKS, BAGS]
		nestCategories(flat)

		expect(flat).toEqual([DRINKS, BAGS])
	})
})

describe('categoryPath', () => {
	it('writes a top-level category at one segment', () => {
		expect(categoryPath('bags')).toBe('/category/bags')
	})

	it('writes a subcategory under its parent', () => {
		expect(categoryPath('satchels', 'bags')).toBe('/category/bags/satchels')
	})
})

describe('findCategory', () => {
	const ALL = [BAGS, DRINKS, SATCHELS, TOTES]

	/*
	 * ⚠️ `toStrictEqual`, not `toEqual`, everywhere a result carries no parent — and it is the assertion
	 * itself that is load-bearing here. `toEqual` treats `{ category }` and `{ category, parent: undefined }`
	 * as the same object, so it cannot see the difference between omitting the key and setting it to
	 * `undefined`. The callers spread this result into a loader payload that is serialised into the SSR
	 * HTML, where an explicit `undefined` is not a value JSON has: the key would arrive missing on the
	 * client anyway, having travelled as a difference the server thought it was expressing.
	 */
	it('finds a top-level category and reports no parent', () => {
		expect(findCategory(ALL, 'bags')).toStrictEqual({ category: BAGS })
	})

	it('finds a subcategory and its parent', () => {
		expect(findCategory(ALL, 'satchels')).toEqual({ category: SATCHELS, parent: BAGS })
	})

	it('answers undefined for a slug nobody has', () => {
		expect(findCategory(ALL, 'nope')).toBeUndefined()
	})

	// Slugs are unique across the whole collection rather than per level, so the parent segment of the
	// URL is readability and a breadcrumb — never disambiguation. Which is why the route options have to
	// check it and redirect: `/category/drinks/satchels` resolves the child perfectly well.
	it('finds a subcategory by slug alone, whatever the URL claims its parent is', () => {
		expect(findCategory(ALL, 'totes')?.category).toEqual(TOTES)
	})

	/*
	 * A dangling `idParent` answers the category with no parent rather than nothing at all. The page can
	 * still render — it is the breadcrumb that loses a link — and refusing to resolve the category would
	 * turn one broken row in the database into a 404 on a page full of items.
	 */
	it('answers the category alone when its parent is missing from the list', () => {
		expect(findCategory([SATCHELS], 'satchels')).toStrictEqual({ category: SATCHELS })
	})

	it.each<[string, Partial<FlatCategory>]>([
		['an absent idParent', {}],
		['a null idParent', { idParent: null }]
	])('does not look for a parent given %s', (_label, parent) => {
		const top = category({ _id: 't', name: 'Top', slug: 'top', ...parent })

		expect(findCategory([top], 'top')).toStrictEqual({ category: top })
	})
})
