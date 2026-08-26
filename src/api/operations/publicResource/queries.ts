import { graphql } from '@gql/publicResource'

/**
 * The anonymous catalogue. Every document here is sent without an `Authorization` header, from the SSR
 * loaders as well as from the browser.
 *
 * ⚠️ Select only what the page renders. These queries are the ones a crawler triggers, so their cost is
 * multiplied by every indexed URL — and two of them (`companies`, `items`) sort a collection that will
 * hold hundreds of thousands of documents. The backend indexes cover the exact key order these arguments
 * produce; adding a field is free, adding an argument is not.
 */

/**
 * The `/shops` listing, and `/shops/:city` when `city` is given.
 *
 * `totalIsExact` is selected because it changes what the page may render: the resolver caps the count
 * it is willing to run, so on a large result set `total` is that cap. Showing it as a number would be a
 * lie; the page shows "1000+" instead. Do not drop the field to shorten the query.
 */
export const CompaniesDocument = graphql(`
	query Companies($limit: Int, $offset: Int, $city: String) {
		companies(limit: $limit, offset: $offset, city: $city) {
			nodes {
				_id
				publicName
				slug
				description
				address {
					street
					postalCode
					city
					province
					position {
						type
						coordinates
					}
				}
			}
			total
			totalIsExact
			hasMore
		}
	}
`)

/**
 * The `/shop/:slug` page. Answers null for an unpublished or unknown slug, and the loader turns that
 * into a real 404 rather than an empty page — a soft 404 is indexed, which is worse than the miss.
 */
export const CompanyBySlugDocument = graphql(`
	query CompanyBySlug($slug: String!) {
		companyBySlug(slug: $slug) {
			_id
			publicName
			slug
			description
			address {
				street
				postalCode
				city
				province
				position {
					type
					coordinates
				}
			}
		}
	}
`)

/**
 * The map island's only query. Sent from the browser on every viewport change, never from a loader —
 * the map is client-only, so this must not run during server rendering.
 *
 * `bbox` and `near` are mutually exclusive at the resolver. `distanceMeters` comes back null for the
 * bbox form: `$geoWithin` computes no distance, only `$geoNear` does.
 */
export const CompaniesNearbyDocument = graphql(`
	query CompaniesNearby($bbox: GraphQLInputBoundingBox, $near: GraphQLInputNearPoint, $limit: Int) {
		companiesNearby(bbox: $bbox, near: $near, limit: $limit) {
			nodes {
				_id
				publicName
				slug
				position {
					type
					coordinates
				}
				distanceMeters
			}
			truncated
		}
	}
`)

/**
 * Two pages share this one query: a shop's item list (`companySlug`) and a category listing across
 * every shop (`idCategory`). The resolver takes either.
 */
export const ItemsDocument = graphql(`
	query Items($companySlug: String, $idCategory: ID, $limit: Int, $offset: Int) {
		items(companySlug: $companySlug, idCategory: $idCategory, limit: $limit, offset: $offset) {
			nodes {
				_id
				idCategory
				name
				description
				slug
				companySlug
				companyPublicName
			}
			total
			totalIsExact
			hasMore
		}
	}
`)

/** The `/shop/:companySlug/item/:slug` page. Null on a miss, same 404 handling as `companyBySlug`. */
export const ItemBySlugDocument = graphql(`
	query ItemBySlug($companySlug: String!, $slug: String!) {
		itemBySlug(companySlug: $companySlug, slug: $slug) {
			_id
			idCategory
			name
			description
			slug
			companySlug
			companyPublicName
		}
	}
`)

/**
 * The whole category tree, flat, in one request.
 *
 * Flat rather than nested is the resolver's shape, and the client nests it (`src/lib/categories.ts`).
 * The tree is two levels deep and small enough to fetch whole — it is the navigation, so every public
 * page needs it, and one cached query beats a per-level fetch.
 */
export const ItemCategoriesDocument = graphql(`
	query ItemCategories {
		itemCategories {
			_id
			idParent
			name
			slug
			position
		}
	}
`)

/**
 * `/search?q=&kind=&page=`. Text search over one collection at a time, optionally narrowed to a radius.
 *
 * ⚠️ **Two documents, and the page sends exactly one of them.** The two result sets were never merged —
 * `textScore` is computed per collection, so a shop's 1.4 and an item's 1.1 have never been compared —
 * and now that each is a page of its own, fetching both would mean two text-index scans and two counts
 * to render one of them. The visitor picks the kind; the loader picks the document.
 */
export const SearchCompaniesDocument = graphql(`
	query SearchCompanies($q: String!, $near: GraphQLInputNearPoint, $limit: Int, $offset: Int) {
		searchCompanies(q: $q, near: $near, limit: $limit, offset: $offset) {
			nodes {
				_id
				publicName
				slug
				description
				address {
					street
					postalCode
					city
					province
					position {
						type
						coordinates
					}
				}
			}
			total
			totalIsExact
			hasMore
		}
	}
`)

/** The other half of the search page. See `SearchCompaniesDocument` for why they are two documents. */
export const SearchItemsDocument = graphql(`
	query SearchItems($q: String!, $near: GraphQLInputNearPoint, $limit: Int, $offset: Int) {
		searchItems(q: $q, near: $near, limit: $limit, offset: $offset) {
			nodes {
				_id
				idCategory
				name
				description
				slug
				companySlug
				companyPublicName
			}
			total
			totalIsExact
			hasMore
		}
	}
`)

/**
 * Feeds `/sitemap-:kind-:page.xml`. Keyset paginated: hand back `nextAfterId` until it is null.
 *
 * ⚠️ Never re-implement this with an offset. Walking 500K documents with `skip` degrades quadratically
 * — the server re-reads and discards every skipped one — while `_id > afterId` is one index seek per
 * page regardless of depth.
 */
export const SitemapEntriesDocument = graphql(`
	query SitemapEntries($kind: GraphQLSitemapKind!, $afterId: ID, $limit: Int) {
		sitemapEntries(kind: $kind, afterId: $afterId, limit: $limit) {
			nodes {
				path
			}
			nextAfterId
		}
	}
`)
