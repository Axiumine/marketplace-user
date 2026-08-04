import type { AnyVariables, Client, TypedDocumentNode } from '@urql/core'

/**
 * Runs a query from a route loader and gives back data or throws.
 *
 * urql resolves rather than rejects: a failed operation is an `OperationResult` with `error` set and
 * `data` undefined. A loader that returned that unexamined would hand its component a `data` of
 * `undefined`, and the component would render an empty page — a 200 with no content, which for a shop
 * page is the soft-404 this whole app is built to avoid. Throwing puts it in the router's error
 * boundary, where it belongs.
 *
 * ⚠️ A partial response is treated as a failure too. GraphQL can answer `data` *and* `errors` together
 * when one nullable field resolved badly, and rendering the good half of a shop page is worse than
 * saying nothing went through: it gets indexed. If a route ever genuinely wants the partial answer, it
 * calls `client.query` itself and says why.
 */
export const runQuery = async <Data, Variables extends AnyVariables>(
	client: Client,
	document: TypedDocumentNode<Data, Variables>,
	variables: Variables
): Promise<Data> => {
	const result = await client.query(document, variables).toPromise()

	if (result.error !== undefined) throw result.error
	if (result.data === undefined) throw new Error('The server answered with no data')

	return result.data
}
