import type { CodegenConfig } from '@graphql-codegen/cli'

/**
 * One project per access level, not one merged schema.
 *
 * The five endpoints are five independent GraphQL servers that happen to share a browser. Merging them
 * into a single schema would invent an API that exists nowhere — and here it would not even merge:
 * three of the five slices declare a root pair literally called `QueriesApi`/`MutationsApi`, so
 * `refresh`, `logout` and `me` would collide onto one type and a document could be written that
 * type-checks against the merged shape while no single server can answer it. Keeping them apart also
 * means a document physically cannot be sent to the wrong endpoint — the `graphql()` helper it was
 * built with only knows its own schema, and `endpointFor` in src/api/endpoints.ts maps it back to the
 * one URL that serves it.
 *
 * `documents` is scoped per tier for the same reason.
 */
const preset = 'client' as const

/**
 * Shared by all five projects.
 *
 * `fragmentMasking: false` — the app reads fragment fields directly off the query result rather than
 * threading `useFragment` through every component, which is the right trade for a codebase this size.
 * It matters more here than in the other two apps: the SSR loaders hand their result straight to a
 * `<head>` builder and to JSON-LD serialisation, and a masked fragment cannot be walked by either.
 *
 * `enumsAsTypes` keeps `GraphQLSitemapKind` a string union, so a sitemap shard's kind can be carried in
 * a route param and handed to the query without a cast.
 */
const presetConfig = { fragmentMasking: false }

/**
 * `scalars` maps the two custom scalars the user-resource tier mounts. Both cross the wire as ISO-8601
 * strings: `DateTime` a full timestamp (`registeredAt`, `birth.date` on the way out), `Date` as
 * `YYYY-MM-DD` (`birth.date` on the way in — what an `<input type="date">` produces). Without the map
 * they are typed `unknown`, which on an input field means the value cannot be assigned without a cast:
 * that is how a date input silently becomes `any`.
 *
 * The three public/authorization slices mount no custom scalar, and the entry costs nothing there.
 */
const config = {
	enumsAsTypes: true,
	skipTypename: true,
	useTypeImports: true,
	scalars: { DateTime: 'string', Date: 'string' }
}

const codegenConfig: CodegenConfig = {
	// Tabs, to match every other file in this repo and the eslint `indent` rule the generated output is
	// exempt from but the config file is not.
	config: { useTypeImports: true },
	ignoreNoDocuments: true,
	generates: {
		// The public catalogue — the only endpoint the SSR loaders touch, and the only one with no auth
		// middleware at all. Everything indexable comes from here.
		'src/gql/publicResource/': {
			schema: 'schema/public-resource.graphql',
			documents: 'src/api/operations/publicResource/**/*.ts',
			preset,
			presetConfig,
			config
		},
		'src/gql/publicAuthorization/': {
			schema: 'schema/public-authorization.graphql',
			documents: 'src/api/operations/publicAuthorization/**/*.ts',
			preset,
			presetConfig,
			config
		},
		'src/gql/userAuthorization/': {
			schema: 'schema/user-authenticated-authorization.graphql',
			documents: 'src/api/operations/userAuthorization/**/*.ts',
			preset,
			presetConfig,
			config
		},
		'src/gql/logout/': {
			schema: 'schema/logout.graphql',
			documents: 'src/api/operations/logout/**/*.ts',
			preset,
			presetConfig,
			config
		},
		'src/gql/userResource/': {
			schema: 'schema/user-authenticated-resource.graphql',
			documents: 'src/api/operations/userResource/**/*.ts',
			preset,
			presetConfig,
			config
		}
	}
}

export default codegenConfig
