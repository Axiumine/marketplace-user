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
    "\n  mutation UserRegister($email: String!, $password: String!, $repeatPassword: String!, $turnstileToken: String) {\n    userRegister(email: $email, password: $password, repeatPassword: $repeatPassword, turnstileToken: $turnstileToken)\n  }\n": typeof types.UserRegisterDocument,
    "\n  mutation ShopOwnerRegister($email: String!, $password: String!, $repeatPassword: String!, $turnstileToken: String) {\n    shopOwnerRegister(email: $email, password: $password, repeatPassword: $repeatPassword, turnstileToken: $turnstileToken)\n  }\n": typeof types.ShopOwnerRegisterDocument,
    "\n  mutation UserVerifyEmailResend($email: String!, $turnstileToken: String) {\n    userVerifyEmailResend(email: $email, turnstileToken: $turnstileToken)\n  }\n": typeof types.UserVerifyEmailResendDocument,
    "\n  mutation UserResetPwd($email: String!, $turnstileToken: String) {\n    userResetPwd(email: $email, turnstileToken: $turnstileToken)\n  }\n": typeof types.UserResetPwdDocument,
    "\n  mutation UserUpdatePwd($email: String!, $hash: String!, $password: String!, $turnstileToken: String) {\n    userUpdatePwd(email: $email, hash: $hash, password: $password, turnstileToken: $turnstileToken)\n  }\n": typeof types.UserUpdatePwdDocument,
    "\n  query Companies($limit: Int, $offset: Int, $city: String) {\n    companies(limit: $limit, offset: $offset, city: $city) {\n      nodes {\n        _id\n        publicName\n        slug\n        description\n        address {\n          street\n          postalCode\n          city\n          province\n          position {\n            type\n            coordinates\n          }\n        }\n      }\n      total\n      totalIsExact\n      hasMore\n    }\n  }\n": typeof types.CompaniesDocument,
    "\n  query CompanyBySlug($slug: String!) {\n    companyBySlug(slug: $slug) {\n      _id\n      publicName\n      slug\n      description\n      address {\n        street\n        postalCode\n        city\n        province\n        position {\n          type\n          coordinates\n        }\n      }\n    }\n  }\n": typeof types.CompanyBySlugDocument,
    "\n  query CompaniesNearby($bbox: GraphQLInputBoundingBox, $near: GraphQLInputNearPoint, $limit: Int) {\n    companiesNearby(bbox: $bbox, near: $near, limit: $limit) {\n      nodes {\n        _id\n        publicName\n        slug\n        position {\n          type\n          coordinates\n        }\n        distanceMeters\n      }\n      truncated\n    }\n  }\n": typeof types.CompaniesNearbyDocument,
    "\n  query Items($companySlug: String, $idCategory: ID, $limit: Int, $offset: Int) {\n    items(companySlug: $companySlug, idCategory: $idCategory, limit: $limit, offset: $offset) {\n      nodes {\n        _id\n        idCategory\n        name\n        description\n        slug\n        companySlug\n        companyPublicName\n      }\n      total\n      totalIsExact\n      hasMore\n    }\n  }\n": typeof types.ItemsDocument,
    "\n  query ItemBySlug($companySlug: String!, $slug: String!) {\n    itemBySlug(companySlug: $companySlug, slug: $slug) {\n      _id\n      idCategory\n      name\n      description\n      slug\n      companySlug\n      companyPublicName\n    }\n  }\n": typeof types.ItemBySlugDocument,
    "\n  query ItemCategories {\n    itemCategories {\n      _id\n      idParent\n      name\n      slug\n      position\n    }\n  }\n": typeof types.ItemCategoriesDocument,
    "\n  query SearchCompanies($q: String!, $near: GraphQLInputNearPoint, $limit: Int, $offset: Int) {\n    searchCompanies(q: $q, near: $near, limit: $limit, offset: $offset) {\n      nodes {\n        _id\n        publicName\n        slug\n        description\n        address {\n          street\n          postalCode\n          city\n          province\n          position {\n            type\n            coordinates\n          }\n        }\n      }\n      total\n      totalIsExact\n      hasMore\n    }\n  }\n": typeof types.SearchCompaniesDocument,
    "\n  query SearchItems($q: String!, $near: GraphQLInputNearPoint, $limit: Int, $offset: Int) {\n    searchItems(q: $q, near: $near, limit: $limit, offset: $offset) {\n      nodes {\n        _id\n        idCategory\n        name\n        description\n        slug\n        companySlug\n        companyPublicName\n      }\n      total\n      totalIsExact\n      hasMore\n    }\n  }\n": typeof types.SearchItemsDocument,
    "\n  query SitemapEntries($kind: GraphQLSitemapKind!, $afterId: ID, $limit: Int) {\n    sitemapEntries(kind: $kind, afterId: $afterId, limit: $limit) {\n      nodes {\n        path\n      }\n      nextAfterId\n    }\n  }\n": typeof types.SitemapEntriesDocument,
};
const documents: Documents = {
    "\n  mutation UserRegister($email: String!, $password: String!, $repeatPassword: String!, $turnstileToken: String) {\n    userRegister(email: $email, password: $password, repeatPassword: $repeatPassword, turnstileToken: $turnstileToken)\n  }\n": types.UserRegisterDocument,
    "\n  mutation ShopOwnerRegister($email: String!, $password: String!, $repeatPassword: String!, $turnstileToken: String) {\n    shopOwnerRegister(email: $email, password: $password, repeatPassword: $repeatPassword, turnstileToken: $turnstileToken)\n  }\n": types.ShopOwnerRegisterDocument,
    "\n  mutation UserVerifyEmailResend($email: String!, $turnstileToken: String) {\n    userVerifyEmailResend(email: $email, turnstileToken: $turnstileToken)\n  }\n": types.UserVerifyEmailResendDocument,
    "\n  mutation UserResetPwd($email: String!, $turnstileToken: String) {\n    userResetPwd(email: $email, turnstileToken: $turnstileToken)\n  }\n": types.UserResetPwdDocument,
    "\n  mutation UserUpdatePwd($email: String!, $hash: String!, $password: String!, $turnstileToken: String) {\n    userUpdatePwd(email: $email, hash: $hash, password: $password, turnstileToken: $turnstileToken)\n  }\n": types.UserUpdatePwdDocument,
    "\n  query Companies($limit: Int, $offset: Int, $city: String) {\n    companies(limit: $limit, offset: $offset, city: $city) {\n      nodes {\n        _id\n        publicName\n        slug\n        description\n        address {\n          street\n          postalCode\n          city\n          province\n          position {\n            type\n            coordinates\n          }\n        }\n      }\n      total\n      totalIsExact\n      hasMore\n    }\n  }\n": types.CompaniesDocument,
    "\n  query CompanyBySlug($slug: String!) {\n    companyBySlug(slug: $slug) {\n      _id\n      publicName\n      slug\n      description\n      address {\n        street\n        postalCode\n        city\n        province\n        position {\n          type\n          coordinates\n        }\n      }\n    }\n  }\n": types.CompanyBySlugDocument,
    "\n  query CompaniesNearby($bbox: GraphQLInputBoundingBox, $near: GraphQLInputNearPoint, $limit: Int) {\n    companiesNearby(bbox: $bbox, near: $near, limit: $limit) {\n      nodes {\n        _id\n        publicName\n        slug\n        position {\n          type\n          coordinates\n        }\n        distanceMeters\n      }\n      truncated\n    }\n  }\n": types.CompaniesNearbyDocument,
    "\n  query Items($companySlug: String, $idCategory: ID, $limit: Int, $offset: Int) {\n    items(companySlug: $companySlug, idCategory: $idCategory, limit: $limit, offset: $offset) {\n      nodes {\n        _id\n        idCategory\n        name\n        description\n        slug\n        companySlug\n        companyPublicName\n      }\n      total\n      totalIsExact\n      hasMore\n    }\n  }\n": types.ItemsDocument,
    "\n  query ItemBySlug($companySlug: String!, $slug: String!) {\n    itemBySlug(companySlug: $companySlug, slug: $slug) {\n      _id\n      idCategory\n      name\n      description\n      slug\n      companySlug\n      companyPublicName\n    }\n  }\n": types.ItemBySlugDocument,
    "\n  query ItemCategories {\n    itemCategories {\n      _id\n      idParent\n      name\n      slug\n      position\n    }\n  }\n": types.ItemCategoriesDocument,
    "\n  query SearchCompanies($q: String!, $near: GraphQLInputNearPoint, $limit: Int, $offset: Int) {\n    searchCompanies(q: $q, near: $near, limit: $limit, offset: $offset) {\n      nodes {\n        _id\n        publicName\n        slug\n        description\n        address {\n          street\n          postalCode\n          city\n          province\n          position {\n            type\n            coordinates\n          }\n        }\n      }\n      total\n      totalIsExact\n      hasMore\n    }\n  }\n": types.SearchCompaniesDocument,
    "\n  query SearchItems($q: String!, $near: GraphQLInputNearPoint, $limit: Int, $offset: Int) {\n    searchItems(q: $q, near: $near, limit: $limit, offset: $offset) {\n      nodes {\n        _id\n        idCategory\n        name\n        description\n        slug\n        companySlug\n        companyPublicName\n      }\n      total\n      totalIsExact\n      hasMore\n    }\n  }\n": types.SearchItemsDocument,
    "\n  query SitemapEntries($kind: GraphQLSitemapKind!, $afterId: ID, $limit: Int) {\n    sitemapEntries(kind: $kind, afterId: $afterId, limit: $limit) {\n      nodes {\n        path\n      }\n      nextAfterId\n    }\n  }\n": types.SitemapEntriesDocument,
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
export function graphql(source: "\n  mutation UserRegister($email: String!, $password: String!, $repeatPassword: String!, $turnstileToken: String) {\n    userRegister(email: $email, password: $password, repeatPassword: $repeatPassword, turnstileToken: $turnstileToken)\n  }\n"): (typeof documents)["\n  mutation UserRegister($email: String!, $password: String!, $repeatPassword: String!, $turnstileToken: String) {\n    userRegister(email: $email, password: $password, repeatPassword: $repeatPassword, turnstileToken: $turnstileToken)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ShopOwnerRegister($email: String!, $password: String!, $repeatPassword: String!, $turnstileToken: String) {\n    shopOwnerRegister(email: $email, password: $password, repeatPassword: $repeatPassword, turnstileToken: $turnstileToken)\n  }\n"): (typeof documents)["\n  mutation ShopOwnerRegister($email: String!, $password: String!, $repeatPassword: String!, $turnstileToken: String) {\n    shopOwnerRegister(email: $email, password: $password, repeatPassword: $repeatPassword, turnstileToken: $turnstileToken)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UserVerifyEmailResend($email: String!, $turnstileToken: String) {\n    userVerifyEmailResend(email: $email, turnstileToken: $turnstileToken)\n  }\n"): (typeof documents)["\n  mutation UserVerifyEmailResend($email: String!, $turnstileToken: String) {\n    userVerifyEmailResend(email: $email, turnstileToken: $turnstileToken)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UserResetPwd($email: String!, $turnstileToken: String) {\n    userResetPwd(email: $email, turnstileToken: $turnstileToken)\n  }\n"): (typeof documents)["\n  mutation UserResetPwd($email: String!, $turnstileToken: String) {\n    userResetPwd(email: $email, turnstileToken: $turnstileToken)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UserUpdatePwd($email: String!, $hash: String!, $password: String!, $turnstileToken: String) {\n    userUpdatePwd(email: $email, hash: $hash, password: $password, turnstileToken: $turnstileToken)\n  }\n"): (typeof documents)["\n  mutation UserUpdatePwd($email: String!, $hash: String!, $password: String!, $turnstileToken: String) {\n    userUpdatePwd(email: $email, hash: $hash, password: $password, turnstileToken: $turnstileToken)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Companies($limit: Int, $offset: Int, $city: String) {\n    companies(limit: $limit, offset: $offset, city: $city) {\n      nodes {\n        _id\n        publicName\n        slug\n        description\n        address {\n          street\n          postalCode\n          city\n          province\n          position {\n            type\n            coordinates\n          }\n        }\n      }\n      total\n      totalIsExact\n      hasMore\n    }\n  }\n"): (typeof documents)["\n  query Companies($limit: Int, $offset: Int, $city: String) {\n    companies(limit: $limit, offset: $offset, city: $city) {\n      nodes {\n        _id\n        publicName\n        slug\n        description\n        address {\n          street\n          postalCode\n          city\n          province\n          position {\n            type\n            coordinates\n          }\n        }\n      }\n      total\n      totalIsExact\n      hasMore\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CompanyBySlug($slug: String!) {\n    companyBySlug(slug: $slug) {\n      _id\n      publicName\n      slug\n      description\n      address {\n        street\n        postalCode\n        city\n        province\n        position {\n          type\n          coordinates\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query CompanyBySlug($slug: String!) {\n    companyBySlug(slug: $slug) {\n      _id\n      publicName\n      slug\n      description\n      address {\n        street\n        postalCode\n        city\n        province\n        position {\n          type\n          coordinates\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CompaniesNearby($bbox: GraphQLInputBoundingBox, $near: GraphQLInputNearPoint, $limit: Int) {\n    companiesNearby(bbox: $bbox, near: $near, limit: $limit) {\n      nodes {\n        _id\n        publicName\n        slug\n        position {\n          type\n          coordinates\n        }\n        distanceMeters\n      }\n      truncated\n    }\n  }\n"): (typeof documents)["\n  query CompaniesNearby($bbox: GraphQLInputBoundingBox, $near: GraphQLInputNearPoint, $limit: Int) {\n    companiesNearby(bbox: $bbox, near: $near, limit: $limit) {\n      nodes {\n        _id\n        publicName\n        slug\n        position {\n          type\n          coordinates\n        }\n        distanceMeters\n      }\n      truncated\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Items($companySlug: String, $idCategory: ID, $limit: Int, $offset: Int) {\n    items(companySlug: $companySlug, idCategory: $idCategory, limit: $limit, offset: $offset) {\n      nodes {\n        _id\n        idCategory\n        name\n        description\n        slug\n        companySlug\n        companyPublicName\n      }\n      total\n      totalIsExact\n      hasMore\n    }\n  }\n"): (typeof documents)["\n  query Items($companySlug: String, $idCategory: ID, $limit: Int, $offset: Int) {\n    items(companySlug: $companySlug, idCategory: $idCategory, limit: $limit, offset: $offset) {\n      nodes {\n        _id\n        idCategory\n        name\n        description\n        slug\n        companySlug\n        companyPublicName\n      }\n      total\n      totalIsExact\n      hasMore\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ItemBySlug($companySlug: String!, $slug: String!) {\n    itemBySlug(companySlug: $companySlug, slug: $slug) {\n      _id\n      idCategory\n      name\n      description\n      slug\n      companySlug\n      companyPublicName\n    }\n  }\n"): (typeof documents)["\n  query ItemBySlug($companySlug: String!, $slug: String!) {\n    itemBySlug(companySlug: $companySlug, slug: $slug) {\n      _id\n      idCategory\n      name\n      description\n      slug\n      companySlug\n      companyPublicName\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ItemCategories {\n    itemCategories {\n      _id\n      idParent\n      name\n      slug\n      position\n    }\n  }\n"): (typeof documents)["\n  query ItemCategories {\n    itemCategories {\n      _id\n      idParent\n      name\n      slug\n      position\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SearchCompanies($q: String!, $near: GraphQLInputNearPoint, $limit: Int, $offset: Int) {\n    searchCompanies(q: $q, near: $near, limit: $limit, offset: $offset) {\n      nodes {\n        _id\n        publicName\n        slug\n        description\n        address {\n          street\n          postalCode\n          city\n          province\n          position {\n            type\n            coordinates\n          }\n        }\n      }\n      total\n      totalIsExact\n      hasMore\n    }\n  }\n"): (typeof documents)["\n  query SearchCompanies($q: String!, $near: GraphQLInputNearPoint, $limit: Int, $offset: Int) {\n    searchCompanies(q: $q, near: $near, limit: $limit, offset: $offset) {\n      nodes {\n        _id\n        publicName\n        slug\n        description\n        address {\n          street\n          postalCode\n          city\n          province\n          position {\n            type\n            coordinates\n          }\n        }\n      }\n      total\n      totalIsExact\n      hasMore\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SearchItems($q: String!, $near: GraphQLInputNearPoint, $limit: Int, $offset: Int) {\n    searchItems(q: $q, near: $near, limit: $limit, offset: $offset) {\n      nodes {\n        _id\n        idCategory\n        name\n        description\n        slug\n        companySlug\n        companyPublicName\n      }\n      total\n      totalIsExact\n      hasMore\n    }\n  }\n"): (typeof documents)["\n  query SearchItems($q: String!, $near: GraphQLInputNearPoint, $limit: Int, $offset: Int) {\n    searchItems(q: $q, near: $near, limit: $limit, offset: $offset) {\n      nodes {\n        _id\n        idCategory\n        name\n        description\n        slug\n        companySlug\n        companyPublicName\n      }\n      total\n      totalIsExact\n      hasMore\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SitemapEntries($kind: GraphQLSitemapKind!, $afterId: ID, $limit: Int) {\n    sitemapEntries(kind: $kind, afterId: $afterId, limit: $limit) {\n      nodes {\n        path\n      }\n      nextAfterId\n    }\n  }\n"): (typeof documents)["\n  query SitemapEntries($kind: GraphQLSitemapKind!, $afterId: ID, $limit: Int) {\n    sitemapEntries(kind: $kind, afterId: $afterId, limit: $limit) {\n      nodes {\n        path\n      }\n      nextAfterId\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;