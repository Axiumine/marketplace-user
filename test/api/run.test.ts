import type { TypedDocumentNode } from '@urql/core'
import { gql } from '@urql/core'
import { describe, expect, it } from 'vitest'

import { runQuery } from '@/api/run'
import { createSsrClient } from '@/api/ssr'

import { graphQLError, stubGraphQL } from '../helpers/graphql'

const SSR_URL = 'http://127.0.0.1:4027/public-resource'

interface Shop {
	readonly shop: { readonly slug: string } | null
}

const ShopDocument = gql`
	query Shop($slug: String!) {
		shop(slug: $slug) {
			slug
		}
	}
` as TypedDocumentNode<Shop, { slug: string }>

const run = () => runQuery(createSsrClient(SSR_URL), ShopDocument, { slug: 'rivers-boutique' })

describe('runQuery', () => {
	it('gives back the data a successful query answered', async () => {
		stubGraphQL({ Shop: { data: { shop: { slug: 'rivers-boutique' } } } })

		expect(await run()).toEqual({ shop: { slug: 'rivers-boutique' } })
	})

	it('passes the variables through to the server', async () => {
		const stub = stubGraphQL({ Shop: { data: { shop: null } } })
		await run()

		expect(stub.calls[0]?.variables).toEqual({ slug: 'rivers-boutique' })
	})

	/*
	 * ⚠️ urql resolves rather than rejects: a failed operation is an `OperationResult` with `error` set
	 * and `data` undefined. A loader that returned that unexamined would hand its component `undefined`
	 * and the component would render an empty page — a 200 with no content, which for a shop page is
	 * exactly the soft-404 this app exists to avoid.
	 */
	it('throws the error rather than answering an empty page', async () => {
		stubGraphQL({ Shop: { errors: [graphQLError('Not Found', 'This shop does not exist', 404)], status: 404 } })

		await expect(run()).rejects.toThrow('Not Found')
	})

	it('throws when the request never reached the server', async () => {
		stubGraphQL({ Shop: { networkError: 'ECONNREFUSED' } })

		await expect(run()).rejects.toThrow()
	})

	/*
	 * ⚠️ A partial response is a failure too. GraphQL answers `data` *and* `errors` together when one
	 * nullable field resolved badly, and rendering the good half of a shop page is worse than rendering
	 * nothing: the half-page is served with a 200 and gets indexed.
	 */
	it('throws on a partial response rather than rendering the half that worked', async () => {
		stubGraphQL({
			Shop: { data: { shop: { slug: 'rivers-boutique' } }, errors: [graphQLError('Internal Server Error')] }
		})

		await expect(run()).rejects.toThrow('Internal Server Error')
	})

	// A body that is not a GraphQL envelope at all — nginx answering the endpoint itself, a maintenance
	// page, a misrouted proxy — reaches the caller as an error rather than as an empty render.
	it('throws when the body is not a GraphQL envelope', async () => {
		stubGraphQL({ Shop: { body: JSON.stringify({ errors: { message: 'nginx' } }) } })

		await expect(run()).rejects.toThrow('No Content')
	})

	/*
	 * The last guard, and the one the fetch layer cannot produce: urql's `OperationResult` types `data` as
	 * optional, so a result with neither `data` nor `error` is expressible even though the current
	 * transport turns that body into a `No Content` error first. Returning it unexamined would hand a
	 * loader `undefined`, and the page would render blank with a 200 — which is the soft-404 again, this
	 * time with nothing in the console.
	 *
	 * Driven through a stand-in client on purpose: the assertion is `runQuery`'s contract with urql, not
	 * the shape of a response body, and pinning it to whichever body today's urql happens to reduce to
	 * `undefined` would make it a test of the library's internals.
	 */
	it('throws when the client answers with neither data nor an error', async () => {
		const client = {
			query: () => ({ toPromise: () => Promise.resolve({ data: undefined, error: undefined }) })
		} as unknown as Parameters<typeof runQuery>[0]

		await expect(runQuery(client, ShopDocument, { slug: 'x' })).rejects.toThrow('The server answered with no data')
	})

	// A resolver answering `null` for a nullable field is data, not an absence — the route decides whether
	// a missing shop is a 404, and it cannot decide that if the query threw first.
	it('answers a null field as data rather than as a failure', async () => {
		stubGraphQL({ Shop: { data: { shop: null } } })

		expect(await run()).toEqual({ shop: null })
	})
})
