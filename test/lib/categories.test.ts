import { describe, expect, it } from 'vitest'

import type { FlatCategory } from '@/lib/categories'
import { categoryPath, findCategory, nestCategories } from '@/lib/categories'

const category = (over: Partial<FlatCategory> & Pick<FlatCategory, '_id' | 'name' | 'slug'>): FlatCategory => ({
	position: 0,
	...over
})

const BREAD = category({ _id: 'c1', name: 'Pane', slug: 'pane', position: 1 })
const DRINKS = category({ _id: 'c2', name: 'Bevande', slug: 'bevande', position: 2 })
const FOCACCE = category({ _id: 'c3', name: 'Focacce', slug: 'focacce', position: 1, idParent: 'c1' })
const GRISSINI = category({ _id: 'c4', name: 'Grissini', slug: 'grissini', position: 2, idParent: 'c1' })

describe('nestCategories', () => {
	it('hangs each subcategory under its parent', () => {
		const tree = nestCategories([FOCACCE, BREAD, GRISSINI, DRINKS])

		expect(tree.map((node) => node.slug)).toEqual(['pane', 'bevande'])
		expect(tree[0]?.children.map((node) => node.slug)).toEqual(['focacce', 'grissini'])
		expect(tree[1]?.children).toEqual([])
	})

	// Two levels by construction — the Admin-tier resolver refuses a parent that already has one — so a
	// grandchild is not something the tree has to represent, and every node's children are leaves.
	it('leaves every subcategory childless', () => {
		const tree = nestCategories([BREAD, FOCACCE])

		expect(tree[0]?.children[0]?.children).toEqual([])
	})

	it('orders both levels by position rather than by the order the resolver answered in', () => {
		const tree = nestCategories([DRINKS, GRISSINI, BREAD, FOCACCE])

		expect(tree.map((node) => node.name)).toEqual(['Pane', 'Bevande'])
		expect(tree[0]?.children.map((node) => node.name)).toEqual(['Focacce', 'Grissini'])
	})

	/*
	 * The operator UI does not force distinct positions, and Mongo's answer order for two equal ones is
	 * not stable between requests — so without a tiebreak the navigation reshuffles itself at random.
	 * `it-IT` rather than the default collation because the default sorts every accented letter after
	 * `z`: `Àlpi` would come after `Zucchero`.
	 */
	it('breaks a position tie by name, with an Italian collator', () => {
		const zucchero = category({ _id: 'z', name: 'Zucchero', slug: 'zucchero', position: 5 })
		const alpi = category({ _id: 'a', name: 'Àlpi', slug: 'alpi', position: 5 })

		expect(nestCategories([zucchero, alpi]).map((node) => node.name)).toEqual(['Àlpi', 'Zucchero'])
	})

	it('breaks a position tie between two subcategories of the same parent', () => {
		const b = category({ _id: 'x1', name: 'Bianco', slug: 'bianco', position: 1, idParent: 'c1' })
		const a = category({ _id: 'x2', name: 'Àzzurro', slug: 'azzurro', position: 1, idParent: 'c1' })

		expect(nestCategories([BREAD, b, a])[0]?.children.map((node) => node.name)).toEqual(['Àzzurro', 'Bianco'])
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
		const orphan = category({ _id: 'o', name: 'Orfana', slug: 'orfana', idParent: 'gone' })

		expect(nestCategories([BREAD, orphan]).map((node) => node.slug)).toEqual(['pane'])
	})

	it('answers an empty tree for an empty list', () => {
		expect(nestCategories([])).toEqual([])
	})

	// The input is what a loader got back from urql, which hands out its cached array. Sorting it in
	// place would reorder the cache entry every other page holds a reference to.
	it('does not reorder the array it was given', () => {
		const flat = [DRINKS, BREAD]
		nestCategories(flat)

		expect(flat).toEqual([DRINKS, BREAD])
	})
})

describe('categoryPath', () => {
	it('writes a top-level category at one segment', () => {
		expect(categoryPath('pane')).toBe('/category/pane')
	})

	it('writes a subcategory under its parent', () => {
		expect(categoryPath('focacce', 'pane')).toBe('/category/pane/focacce')
	})
})

describe('findCategory', () => {
	const ALL = [BREAD, DRINKS, FOCACCE, GRISSINI]

	/*
	 * ⚠️ `toStrictEqual`, not `toEqual`, everywhere a result carries no parent — and it is the assertion
	 * itself that is load-bearing here. `toEqual` treats `{ category }` and `{ category, parent: undefined }`
	 * as the same object, so it cannot see the difference between omitting the key and setting it to
	 * `undefined`. The callers spread this result into a loader payload that is serialised into the SSR
	 * HTML, where an explicit `undefined` is not a value JSON has: the key would arrive missing on the
	 * client anyway, having travelled as a difference the server thought it was expressing.
	 */
	it('finds a top-level category and reports no parent', () => {
		expect(findCategory(ALL, 'pane')).toStrictEqual({ category: BREAD })
	})

	it('finds a subcategory and its parent', () => {
		expect(findCategory(ALL, 'focacce')).toEqual({ category: FOCACCE, parent: BREAD })
	})

	it('answers undefined for a slug nobody has', () => {
		expect(findCategory(ALL, 'nope')).toBeUndefined()
	})

	// Slugs are unique across the whole collection rather than per level, so the parent segment of the
	// URL is readability and a breadcrumb — never disambiguation. Which is why the route options have to
	// check it and redirect: `/category/bevande/focacce` resolves the child perfectly well.
	it('finds a subcategory by slug alone, whatever the URL claims its parent is', () => {
		expect(findCategory(ALL, 'grissini')?.category).toEqual(GRISSINI)
	})

	/*
	 * A dangling `idParent` answers the category with no parent rather than nothing at all. The page can
	 * still render — it is the breadcrumb that loses a link — and refusing to resolve the category would
	 * turn one broken row in the database into a 404 on a page full of items.
	 */
	it('answers the category alone when its parent is missing from the list', () => {
		expect(findCategory([FOCACCE], 'focacce')).toStrictEqual({ category: FOCACCE })
	})

	it.each<[string, Partial<FlatCategory>]>([
		['an absent idParent', {}],
		['a null idParent', { idParent: null }]
	])('does not look for a parent given %s', (_label, parent) => {
		const top = category({ _id: 't', name: 'Top', slug: 'top', ...parent })

		expect(findCategory([top], 'top')).toStrictEqual({ category: top })
	})
})
