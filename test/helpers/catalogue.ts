import type { GraphQLReply } from './graphql'

/**
 * The catalogue fixtures, shared by every route-options test.
 *
 * They are shaped after the *selection sets* in `src/api/operations/publicResource/queries.ts` rather than
 * after the collections in MongoDB — a loader reads what the document asked for, and a fixture carrying a
 * field the query never selects hides a missing field in the query itself.
 */

export interface FixtureCompany {
	readonly _id: string
	readonly publicName: string
	readonly slug: string
	readonly description: string | null
	readonly address: {
		readonly street: string
		readonly postalCode: string
		readonly city: string
		readonly province: string
		/**
		 * Optional *and* nullable, because both spellings really arrive: a resolver that has no position
		 * omits the field, and the codegen type spells the absence `null`. A fixture that could only say
		 * `null` left every "no coordinates" branch tested against half its inputs.
		 */
		readonly position?: { readonly type: string; readonly coordinates: readonly number[] } | null | undefined
	}
}

export interface FixtureItem {
	readonly _id: string
	readonly idCategory: string
	readonly name: string
	readonly description: string
	readonly slug: string
	readonly companySlug: string
	readonly companyPublicName: string
}

export interface FixtureCategory {
	readonly _id: string
	readonly idParent: string | null
	readonly name: string
	readonly slug: string
	readonly position: number
}

export const companyOf = (over: Partial<FixtureCompany> = {}): FixtureCompany => ({
	_id: '66b0000000000000000000c1',
	publicName: 'Rivers Boutique',
	slug: 'rivers-boutique',
	description: 'Leather goods, made two streets away.',
	address: {
		street: '1 Main Street',
		postalCode: '02108',
		city: 'Boston',
		province: 'MA',
		position: { type: 'Point', coordinates: [-71.0589, 42.3601] }
	},
	...over
})

export const itemOf = (over: Partial<FixtureItem> = {}): FixtureItem => ({
	_id: '66b0000000000000000000e1',
	idCategory: 'cat-apparel',
	name: 'Leather satchel',
	description: 'Stitched by hand.',
	slug: 'leather-satchel',
	companySlug: 'rivers-boutique',
	companyPublicName: 'Rivers Boutique',
	...over
})

/** The flat documents the resolver answers with — `nestCategories` turns them into a two-level tree. */
export const CATEGORIES: readonly FixtureCategory[] = [
	{ _id: 'cat-apparel', idParent: null, name: 'Apparel', slug: 'apparel', position: 1 },
	{ _id: 'cat-craft', idParent: null, name: 'Handmade', slug: 'handmade', position: 2 },
	{ _id: 'cat-footwear', idParent: 'cat-apparel', name: 'Footwear', slug: 'footwear', position: 1 }
]

export interface PageOptions {
	readonly total?: number
	readonly totalIsExact?: boolean
	readonly hasMore?: boolean
}

export const companiesReply = (nodes: readonly FixtureCompany[], page: PageOptions = {}): GraphQLReply => ({
	data: {
		companies: {
			nodes,
			total: page.total ?? nodes.length,
			totalIsExact: page.totalIsExact ?? true,
			hasMore: page.hasMore ?? false
		}
	}
})

export const itemsReply = (nodes: readonly FixtureItem[], page: PageOptions = {}): GraphQLReply => ({
	data: {
		items: {
			nodes,
			total: page.total ?? nodes.length,
			totalIsExact: page.totalIsExact ?? true,
			hasMore: page.hasMore ?? false
		}
	}
})

/**
 * The two search fields answer the same page envelope as the listings, under their own names.
 *
 * ⚠️ Two helpers rather than one taking a kind: the field name in the reply is what the operation
 * document asked for, and a helper that guessed it would let a test stub `searchItems` while the page
 * queries `searchCompanies` and still pass — the stub answers by operation name, not by field.
 */
export const searchCompaniesReply = (nodes: readonly FixtureCompany[], page: PageOptions = {}): GraphQLReply => ({
	data: {
		searchCompanies: {
			nodes,
			total: page.total ?? nodes.length,
			totalIsExact: page.totalIsExact ?? true,
			hasMore: page.hasMore ?? false
		}
	}
})

/** `totalIsExact` defaults to **false** here: the item count joins neither `company.published` nor the radius. */
export const searchItemsReply = (nodes: readonly FixtureItem[], page: PageOptions = {}): GraphQLReply => ({
	data: {
		searchItems: {
			nodes,
			total: page.total ?? nodes.length,
			totalIsExact: page.totalIsExact ?? false,
			hasMore: page.hasMore ?? false
		}
	}
})

export const categoriesReply = (docs: readonly FixtureCategory[] = CATEGORIES): GraphQLReply => ({
	data: { itemCategories: docs }
})

export const nearbyReply = (nodes: readonly FixtureCompany[] = [], truncated = false): GraphQLReply => ({
	data: {
		companiesNearby: {
			nodes: nodes.map((company) => ({
				_id: company._id,
				publicName: company.publicName,
				slug: company.slug,
				position: company.address.position,
				distanceMeters: null
			})),
			truncated
		}
	}
})
