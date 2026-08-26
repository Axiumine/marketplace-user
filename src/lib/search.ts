/**
 * What a visitor can search, as a closed set.
 *
 * The two collections carry separate text indexes and separate relevance scales — `textScore` is
 * computed against each collection's own term statistics and field weights, so a shop's 1.4 and an
 * item's 1.1 have never been compared. The API therefore answers one kind per request
 * (`searchCompanies` / `searchItems`), and this is the vocabulary that decides which.
 *
 * It lives here rather than in the route because the header's search box carries the current kind
 * forward on submit, and a component importing the route it feeds would be a cycle. Two modules read
 * these names; neither owns them.
 */
export const SEARCH_KINDS = ['items', 'companies'] as const

export type SearchKind = (typeof SEARCH_KINDS)[number]

/**
 * Items, not shops.
 *
 * A visitor typing into a marketplace's search box is looking for a thing to buy far more often than
 * for the business selling it — and an item hit names its shop anyway, so the items tab answers both
 * questions while the shops tab answers one. It is also the larger of the two result sets, which makes
 * it the one worth paginating by default.
 *
 * ⚠️ The default kind is **absent from the URL**, never spelled out: `/search?q=lamp` and
 * `/search?q=lamp&kind=items` are the same page, and minting both is how one search ends up cached,
 * linked and shared under two addresses.
 */
export const DEFAULT_SEARCH_KIND: SearchKind = 'items'
