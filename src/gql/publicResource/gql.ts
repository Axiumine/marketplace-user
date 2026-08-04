/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n\tmutation UserRegister($email: String!, $password: String!, $repeatPassword: String!, $turnstileToken: String) {\n\t\tuserRegister(email: $email, password: $password, repeatPassword: $repeatPassword, turnstileToken: $turnstileToken)\n\t}\n": typeof types.UserRegisterDocument,
    "\n\tmutation UserVerifyEmailResend($email: String!, $turnstileToken: String) {\n\t\tuserVerifyEmailResend(email: $email, turnstileToken: $turnstileToken)\n\t}\n": typeof types.UserVerifyEmailResendDocument,
    "\n\tmutation UserResetPwd($email: String!, $turnstileToken: String) {\n\t\tuserResetPwd(email: $email, turnstileToken: $turnstileToken)\n\t}\n": typeof types.UserResetPwdDocument,
    "\n\tmutation UserUpdatePwd($email: String!, $hash: String!, $password: String!, $turnstileToken: String) {\n\t\tuserUpdatePwd(email: $email, hash: $hash, password: $password, turnstileToken: $turnstileToken)\n\t}\n": typeof types.UserUpdatePwdDocument,
    "\n\tquery Companies($limit: Int, $offset: Int, $city: String) {\n\t\tcompanies(limit: $limit, offset: $offset, city: $city) {\n\t\t\tnodes {\n\t\t\t\t_id\n\t\t\t\tpublicName\n\t\t\t\tslug\n\t\t\t\tdescription\n\t\t\t\taddress {\n\t\t\t\t\tstreet\n\t\t\t\t\tpostalCode\n\t\t\t\t\tcity\n\t\t\t\t\tprovince\n\t\t\t\t\tposition {\n\t\t\t\t\t\ttype\n\t\t\t\t\t\tcoordinates\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\ttotal\n\t\t\ttotalIsExact\n\t\t\thasMore\n\t\t}\n\t}\n": typeof types.CompaniesDocument,
    "\n\tquery CompanyBySlug($slug: String!) {\n\t\tcompanyBySlug(slug: $slug) {\n\t\t\t_id\n\t\t\tpublicName\n\t\t\tslug\n\t\t\tdescription\n\t\t\taddress {\n\t\t\t\tstreet\n\t\t\t\tpostalCode\n\t\t\t\tcity\n\t\t\t\tprovince\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n": typeof types.CompanyBySlugDocument,
    "\n\tquery CompaniesNearby($bbox: GraphQLInputBoundingBox, $near: GraphQLInputNearPoint, $limit: Int) {\n\t\tcompaniesNearby(bbox: $bbox, near: $near, limit: $limit) {\n\t\t\tnodes {\n\t\t\t\t_id\n\t\t\t\tpublicName\n\t\t\t\tslug\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t\tdistanceMeters\n\t\t\t}\n\t\t\ttruncated\n\t\t}\n\t}\n": typeof types.CompaniesNearbyDocument,
    "\n\tquery Items($companySlug: String, $idCategory: ID, $limit: Int, $offset: Int) {\n\t\titems(companySlug: $companySlug, idCategory: $idCategory, limit: $limit, offset: $offset) {\n\t\t\tnodes {\n\t\t\t\t_id\n\t\t\t\tidCategory\n\t\t\t\tname\n\t\t\t\tdescription\n\t\t\t\tslug\n\t\t\t\tcompanySlug\n\t\t\t\tcompanyPublicName\n\t\t\t}\n\t\t\ttotal\n\t\t\ttotalIsExact\n\t\t\thasMore\n\t\t}\n\t}\n": typeof types.ItemsDocument,
    "\n\tquery ItemBySlug($companySlug: String!, $slug: String!) {\n\t\titemBySlug(companySlug: $companySlug, slug: $slug) {\n\t\t\t_id\n\t\t\tidCategory\n\t\t\tname\n\t\t\tdescription\n\t\t\tslug\n\t\t\tcompanySlug\n\t\t\tcompanyPublicName\n\t\t}\n\t}\n": typeof types.ItemBySlugDocument,
    "\n\tquery ItemCategories {\n\t\titemCategories {\n\t\t\t_id\n\t\t\tidParent\n\t\t\tname\n\t\t\tslug\n\t\t\tposition\n\t\t}\n\t}\n": typeof types.ItemCategoriesDocument,
    "\n\tquery Search($q: String!, $near: GraphQLInputNearPoint, $limit: Int) {\n\t\tsearch(q: $q, near: $near, limit: $limit) {\n\t\t\tcompanies {\n\t\t\t\t_id\n\t\t\t\tpublicName\n\t\t\t\tslug\n\t\t\t\tdescription\n\t\t\t\taddress {\n\t\t\t\t\tstreet\n\t\t\t\t\tpostalCode\n\t\t\t\t\tcity\n\t\t\t\t\tprovince\n\t\t\t\t\tposition {\n\t\t\t\t\t\ttype\n\t\t\t\t\t\tcoordinates\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\titems {\n\t\t\t\t_id\n\t\t\t\tidCategory\n\t\t\t\tname\n\t\t\t\tdescription\n\t\t\t\tslug\n\t\t\t\tcompanySlug\n\t\t\t\tcompanyPublicName\n\t\t\t}\n\t\t}\n\t}\n": typeof types.SearchDocument,
    "\n\tquery SitemapEntries($kind: GraphQLSitemapKind!, $afterId: ID, $limit: Int) {\n\t\tsitemapEntries(kind: $kind, afterId: $afterId, limit: $limit) {\n\t\t\tnodes {\n\t\t\t\tpath\n\t\t\t}\n\t\t\tnextAfterId\n\t\t}\n\t}\n": typeof types.SitemapEntriesDocument,
};
const documents: Documents = {
    "\n\tmutation UserRegister($email: String!, $password: String!, $repeatPassword: String!, $turnstileToken: String) {\n\t\tuserRegister(email: $email, password: $password, repeatPassword: $repeatPassword, turnstileToken: $turnstileToken)\n\t}\n": types.UserRegisterDocument,
    "\n\tmutation UserVerifyEmailResend($email: String!, $turnstileToken: String) {\n\t\tuserVerifyEmailResend(email: $email, turnstileToken: $turnstileToken)\n\t}\n": types.UserVerifyEmailResendDocument,
    "\n\tmutation UserResetPwd($email: String!, $turnstileToken: String) {\n\t\tuserResetPwd(email: $email, turnstileToken: $turnstileToken)\n\t}\n": types.UserResetPwdDocument,
    "\n\tmutation UserUpdatePwd($email: String!, $hash: String!, $password: String!, $turnstileToken: String) {\n\t\tuserUpdatePwd(email: $email, hash: $hash, password: $password, turnstileToken: $turnstileToken)\n\t}\n": types.UserUpdatePwdDocument,
    "\n\tquery Companies($limit: Int, $offset: Int, $city: String) {\n\t\tcompanies(limit: $limit, offset: $offset, city: $city) {\n\t\t\tnodes {\n\t\t\t\t_id\n\t\t\t\tpublicName\n\t\t\t\tslug\n\t\t\t\tdescription\n\t\t\t\taddress {\n\t\t\t\t\tstreet\n\t\t\t\t\tpostalCode\n\t\t\t\t\tcity\n\t\t\t\t\tprovince\n\t\t\t\t\tposition {\n\t\t\t\t\t\ttype\n\t\t\t\t\t\tcoordinates\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\ttotal\n\t\t\ttotalIsExact\n\t\t\thasMore\n\t\t}\n\t}\n": types.CompaniesDocument,
    "\n\tquery CompanyBySlug($slug: String!) {\n\t\tcompanyBySlug(slug: $slug) {\n\t\t\t_id\n\t\t\tpublicName\n\t\t\tslug\n\t\t\tdescription\n\t\t\taddress {\n\t\t\t\tstreet\n\t\t\t\tpostalCode\n\t\t\t\tcity\n\t\t\t\tprovince\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n": types.CompanyBySlugDocument,
    "\n\tquery CompaniesNearby($bbox: GraphQLInputBoundingBox, $near: GraphQLInputNearPoint, $limit: Int) {\n\t\tcompaniesNearby(bbox: $bbox, near: $near, limit: $limit) {\n\t\t\tnodes {\n\t\t\t\t_id\n\t\t\t\tpublicName\n\t\t\t\tslug\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t\tdistanceMeters\n\t\t\t}\n\t\t\ttruncated\n\t\t}\n\t}\n": types.CompaniesNearbyDocument,
    "\n\tquery Items($companySlug: String, $idCategory: ID, $limit: Int, $offset: Int) {\n\t\titems(companySlug: $companySlug, idCategory: $idCategory, limit: $limit, offset: $offset) {\n\t\t\tnodes {\n\t\t\t\t_id\n\t\t\t\tidCategory\n\t\t\t\tname\n\t\t\t\tdescription\n\t\t\t\tslug\n\t\t\t\tcompanySlug\n\t\t\t\tcompanyPublicName\n\t\t\t}\n\t\t\ttotal\n\t\t\ttotalIsExact\n\t\t\thasMore\n\t\t}\n\t}\n": types.ItemsDocument,
    "\n\tquery ItemBySlug($companySlug: String!, $slug: String!) {\n\t\titemBySlug(companySlug: $companySlug, slug: $slug) {\n\t\t\t_id\n\t\t\tidCategory\n\t\t\tname\n\t\t\tdescription\n\t\t\tslug\n\t\t\tcompanySlug\n\t\t\tcompanyPublicName\n\t\t}\n\t}\n": types.ItemBySlugDocument,
    "\n\tquery ItemCategories {\n\t\titemCategories {\n\t\t\t_id\n\t\t\tidParent\n\t\t\tname\n\t\t\tslug\n\t\t\tposition\n\t\t}\n\t}\n": types.ItemCategoriesDocument,
    "\n\tquery Search($q: String!, $near: GraphQLInputNearPoint, $limit: Int) {\n\t\tsearch(q: $q, near: $near, limit: $limit) {\n\t\t\tcompanies {\n\t\t\t\t_id\n\t\t\t\tpublicName\n\t\t\t\tslug\n\t\t\t\tdescription\n\t\t\t\taddress {\n\t\t\t\t\tstreet\n\t\t\t\t\tpostalCode\n\t\t\t\t\tcity\n\t\t\t\t\tprovince\n\t\t\t\t\tposition {\n\t\t\t\t\t\ttype\n\t\t\t\t\t\tcoordinates\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\titems {\n\t\t\t\t_id\n\t\t\t\tidCategory\n\t\t\t\tname\n\t\t\t\tdescription\n\t\t\t\tslug\n\t\t\t\tcompanySlug\n\t\t\t\tcompanyPublicName\n\t\t\t}\n\t\t}\n\t}\n": types.SearchDocument,
    "\n\tquery SitemapEntries($kind: GraphQLSitemapKind!, $afterId: ID, $limit: Int) {\n\t\tsitemapEntries(kind: $kind, afterId: $afterId, limit: $limit) {\n\t\t\tnodes {\n\t\t\t\tpath\n\t\t\t}\n\t\t\tnextAfterId\n\t\t}\n\t}\n": types.SitemapEntriesDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation UserRegister($email: String!, $password: String!, $repeatPassword: String!, $turnstileToken: String) {\n\t\tuserRegister(email: $email, password: $password, repeatPassword: $repeatPassword, turnstileToken: $turnstileToken)\n\t}\n"): (typeof documents)["\n\tmutation UserRegister($email: String!, $password: String!, $repeatPassword: String!, $turnstileToken: String) {\n\t\tuserRegister(email: $email, password: $password, repeatPassword: $repeatPassword, turnstileToken: $turnstileToken)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation UserVerifyEmailResend($email: String!, $turnstileToken: String) {\n\t\tuserVerifyEmailResend(email: $email, turnstileToken: $turnstileToken)\n\t}\n"): (typeof documents)["\n\tmutation UserVerifyEmailResend($email: String!, $turnstileToken: String) {\n\t\tuserVerifyEmailResend(email: $email, turnstileToken: $turnstileToken)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation UserResetPwd($email: String!, $turnstileToken: String) {\n\t\tuserResetPwd(email: $email, turnstileToken: $turnstileToken)\n\t}\n"): (typeof documents)["\n\tmutation UserResetPwd($email: String!, $turnstileToken: String) {\n\t\tuserResetPwd(email: $email, turnstileToken: $turnstileToken)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation UserUpdatePwd($email: String!, $hash: String!, $password: String!, $turnstileToken: String) {\n\t\tuserUpdatePwd(email: $email, hash: $hash, password: $password, turnstileToken: $turnstileToken)\n\t}\n"): (typeof documents)["\n\tmutation UserUpdatePwd($email: String!, $hash: String!, $password: String!, $turnstileToken: String) {\n\t\tuserUpdatePwd(email: $email, hash: $hash, password: $password, turnstileToken: $turnstileToken)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery Companies($limit: Int, $offset: Int, $city: String) {\n\t\tcompanies(limit: $limit, offset: $offset, city: $city) {\n\t\t\tnodes {\n\t\t\t\t_id\n\t\t\t\tpublicName\n\t\t\t\tslug\n\t\t\t\tdescription\n\t\t\t\taddress {\n\t\t\t\t\tstreet\n\t\t\t\t\tpostalCode\n\t\t\t\t\tcity\n\t\t\t\t\tprovince\n\t\t\t\t\tposition {\n\t\t\t\t\t\ttype\n\t\t\t\t\t\tcoordinates\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\ttotal\n\t\t\ttotalIsExact\n\t\t\thasMore\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery Companies($limit: Int, $offset: Int, $city: String) {\n\t\tcompanies(limit: $limit, offset: $offset, city: $city) {\n\t\t\tnodes {\n\t\t\t\t_id\n\t\t\t\tpublicName\n\t\t\t\tslug\n\t\t\t\tdescription\n\t\t\t\taddress {\n\t\t\t\t\tstreet\n\t\t\t\t\tpostalCode\n\t\t\t\t\tcity\n\t\t\t\t\tprovince\n\t\t\t\t\tposition {\n\t\t\t\t\t\ttype\n\t\t\t\t\t\tcoordinates\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\ttotal\n\t\t\ttotalIsExact\n\t\t\thasMore\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery CompanyBySlug($slug: String!) {\n\t\tcompanyBySlug(slug: $slug) {\n\t\t\t_id\n\t\t\tpublicName\n\t\t\tslug\n\t\t\tdescription\n\t\t\taddress {\n\t\t\t\tstreet\n\t\t\t\tpostalCode\n\t\t\t\tcity\n\t\t\t\tprovince\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery CompanyBySlug($slug: String!) {\n\t\tcompanyBySlug(slug: $slug) {\n\t\t\t_id\n\t\t\tpublicName\n\t\t\tslug\n\t\t\tdescription\n\t\t\taddress {\n\t\t\t\tstreet\n\t\t\t\tpostalCode\n\t\t\t\tcity\n\t\t\t\tprovince\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery CompaniesNearby($bbox: GraphQLInputBoundingBox, $near: GraphQLInputNearPoint, $limit: Int) {\n\t\tcompaniesNearby(bbox: $bbox, near: $near, limit: $limit) {\n\t\t\tnodes {\n\t\t\t\t_id\n\t\t\t\tpublicName\n\t\t\t\tslug\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t\tdistanceMeters\n\t\t\t}\n\t\t\ttruncated\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery CompaniesNearby($bbox: GraphQLInputBoundingBox, $near: GraphQLInputNearPoint, $limit: Int) {\n\t\tcompaniesNearby(bbox: $bbox, near: $near, limit: $limit) {\n\t\t\tnodes {\n\t\t\t\t_id\n\t\t\t\tpublicName\n\t\t\t\tslug\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t\tdistanceMeters\n\t\t\t}\n\t\t\ttruncated\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery Items($companySlug: String, $idCategory: ID, $limit: Int, $offset: Int) {\n\t\titems(companySlug: $companySlug, idCategory: $idCategory, limit: $limit, offset: $offset) {\n\t\t\tnodes {\n\t\t\t\t_id\n\t\t\t\tidCategory\n\t\t\t\tname\n\t\t\t\tdescription\n\t\t\t\tslug\n\t\t\t\tcompanySlug\n\t\t\t\tcompanyPublicName\n\t\t\t}\n\t\t\ttotal\n\t\t\ttotalIsExact\n\t\t\thasMore\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery Items($companySlug: String, $idCategory: ID, $limit: Int, $offset: Int) {\n\t\titems(companySlug: $companySlug, idCategory: $idCategory, limit: $limit, offset: $offset) {\n\t\t\tnodes {\n\t\t\t\t_id\n\t\t\t\tidCategory\n\t\t\t\tname\n\t\t\t\tdescription\n\t\t\t\tslug\n\t\t\t\tcompanySlug\n\t\t\t\tcompanyPublicName\n\t\t\t}\n\t\t\ttotal\n\t\t\ttotalIsExact\n\t\t\thasMore\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery ItemBySlug($companySlug: String!, $slug: String!) {\n\t\titemBySlug(companySlug: $companySlug, slug: $slug) {\n\t\t\t_id\n\t\t\tidCategory\n\t\t\tname\n\t\t\tdescription\n\t\t\tslug\n\t\t\tcompanySlug\n\t\t\tcompanyPublicName\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery ItemBySlug($companySlug: String!, $slug: String!) {\n\t\titemBySlug(companySlug: $companySlug, slug: $slug) {\n\t\t\t_id\n\t\t\tidCategory\n\t\t\tname\n\t\t\tdescription\n\t\t\tslug\n\t\t\tcompanySlug\n\t\t\tcompanyPublicName\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery ItemCategories {\n\t\titemCategories {\n\t\t\t_id\n\t\t\tidParent\n\t\t\tname\n\t\t\tslug\n\t\t\tposition\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery ItemCategories {\n\t\titemCategories {\n\t\t\t_id\n\t\t\tidParent\n\t\t\tname\n\t\t\tslug\n\t\t\tposition\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery Search($q: String!, $near: GraphQLInputNearPoint, $limit: Int) {\n\t\tsearch(q: $q, near: $near, limit: $limit) {\n\t\t\tcompanies {\n\t\t\t\t_id\n\t\t\t\tpublicName\n\t\t\t\tslug\n\t\t\t\tdescription\n\t\t\t\taddress {\n\t\t\t\t\tstreet\n\t\t\t\t\tpostalCode\n\t\t\t\t\tcity\n\t\t\t\t\tprovince\n\t\t\t\t\tposition {\n\t\t\t\t\t\ttype\n\t\t\t\t\t\tcoordinates\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\titems {\n\t\t\t\t_id\n\t\t\t\tidCategory\n\t\t\t\tname\n\t\t\t\tdescription\n\t\t\t\tslug\n\t\t\t\tcompanySlug\n\t\t\t\tcompanyPublicName\n\t\t\t}\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery Search($q: String!, $near: GraphQLInputNearPoint, $limit: Int) {\n\t\tsearch(q: $q, near: $near, limit: $limit) {\n\t\t\tcompanies {\n\t\t\t\t_id\n\t\t\t\tpublicName\n\t\t\t\tslug\n\t\t\t\tdescription\n\t\t\t\taddress {\n\t\t\t\t\tstreet\n\t\t\t\t\tpostalCode\n\t\t\t\t\tcity\n\t\t\t\t\tprovince\n\t\t\t\t\tposition {\n\t\t\t\t\t\ttype\n\t\t\t\t\t\tcoordinates\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t}\n\t\t\titems {\n\t\t\t\t_id\n\t\t\t\tidCategory\n\t\t\t\tname\n\t\t\t\tdescription\n\t\t\t\tslug\n\t\t\t\tcompanySlug\n\t\t\t\tcompanyPublicName\n\t\t\t}\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery SitemapEntries($kind: GraphQLSitemapKind!, $afterId: ID, $limit: Int) {\n\t\tsitemapEntries(kind: $kind, afterId: $afterId, limit: $limit) {\n\t\t\tnodes {\n\t\t\t\tpath\n\t\t\t}\n\t\t\tnextAfterId\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery SitemapEntries($kind: GraphQLSitemapKind!, $afterId: ID, $limit: Int) {\n\t\tsitemapEntries(kind: $kind, afterId: $afterId, limit: $limit) {\n\t\t\tnodes {\n\t\t\t\tpath\n\t\t\t}\n\t\t\tnextAfterId\n\t\t}\n\t}\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;