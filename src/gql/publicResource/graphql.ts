/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type GraphQlInputBoundingBox = {
  maxLat: number;
  maxLng: number;
  minLat: number;
  minLng: number;
};

export type GraphQlInputNearPoint = {
  lat: number;
  lng: number;
  radiusMeters: number;
};

export type GraphQlSitemapKind =
  /** /category/:slug and /category/:parentSlug/:slug */
  | 'CATEGORY'
  /** /shop/:slug */
  | 'COMPANY'
  /** /shop/:companySlug/item/:slug */
  | 'ITEM';

export type UserRegisterMutationVariables = Exact<{
  email: string;
  password: string;
  repeatPassword: string;
  turnstileToken?: string | null | undefined;
}>;


export type UserRegisterMutation = { userRegister: boolean };

export type UserVerifyEmailResendMutationVariables = Exact<{
  email: string;
  turnstileToken?: string | null | undefined;
}>;


export type UserVerifyEmailResendMutation = { userVerifyEmailResend: boolean };

export type UserResetPwdMutationVariables = Exact<{
  email: string;
  turnstileToken?: string | null | undefined;
}>;


export type UserResetPwdMutation = { userResetPwd: boolean };

export type UserUpdatePwdMutationVariables = Exact<{
  email: string;
  hash: string;
  password: string;
  turnstileToken?: string | null | undefined;
}>;


export type UserUpdatePwdMutation = { userUpdatePwd: boolean };

export type CompaniesQueryVariables = Exact<{
  limit?: number | null | undefined;
  offset?: number | null | undefined;
  city?: string | null | undefined;
}>;


export type CompaniesQuery = { companies: { total: number, totalIsExact: boolean, hasMore: boolean, nodes: Array<{ _id: string, publicName: string, slug: string, description: string | null, address: { street: string, postalCode: string, city: string, province: string, position: { type: string, coordinates: Array<number> } } }> } };

export type CompanyBySlugQueryVariables = Exact<{
  slug: string;
}>;


export type CompanyBySlugQuery = { companyBySlug: { _id: string, publicName: string, slug: string, description: string | null, address: { street: string, postalCode: string, city: string, province: string, position: { type: string, coordinates: Array<number> } } } | null };

export type CompaniesNearbyQueryVariables = Exact<{
  bbox?: GraphQlInputBoundingBox | null | undefined;
  near?: GraphQlInputNearPoint | null | undefined;
  limit?: number | null | undefined;
}>;


export type CompaniesNearbyQuery = { companiesNearby: { truncated: boolean, nodes: Array<{ _id: string, publicName: string, slug: string, distanceMeters: number | null, position: { type: string, coordinates: Array<number> } }> } };

export type ItemsQueryVariables = Exact<{
  companySlug?: string | null | undefined;
  idCategory?: string | number | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type ItemsQuery = { items: { total: number, totalIsExact: boolean, hasMore: boolean, nodes: Array<{ _id: string, idCategory: string, name: string, description: string, slug: string, companySlug: string, companyPublicName: string }> } };

export type ItemBySlugQueryVariables = Exact<{
  companySlug: string;
  slug: string;
}>;


export type ItemBySlugQuery = { itemBySlug: { _id: string, idCategory: string, name: string, description: string, slug: string, companySlug: string, companyPublicName: string } | null };

export type ItemCategoriesQueryVariables = Exact<{ [key: string]: never; }>;


export type ItemCategoriesQuery = { itemCategories: Array<{ _id: string, idParent: string | null, name: string, slug: string, position: number }> };

export type SearchQueryVariables = Exact<{
  q: string;
  near?: GraphQlInputNearPoint | null | undefined;
  limit?: number | null | undefined;
}>;


export type SearchQuery = { search: { companies: Array<{ _id: string, publicName: string, slug: string, description: string | null, address: { street: string, postalCode: string, city: string, province: string, position: { type: string, coordinates: Array<number> } } }>, items: Array<{ _id: string, idCategory: string, name: string, description: string, slug: string, companySlug: string, companyPublicName: string }> } };

export type SitemapEntriesQueryVariables = Exact<{
  kind: GraphQlSitemapKind;
  afterId?: string | number | null | undefined;
  limit?: number | null | undefined;
}>;


export type SitemapEntriesQuery = { sitemapEntries: { nextAfterId: string | null, nodes: Array<{ path: string }> } };


export const UserRegisterDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UserRegister"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"password"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"repeatPassword"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"turnstileToken"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userRegister"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}},{"kind":"Argument","name":{"kind":"Name","value":"password"},"value":{"kind":"Variable","name":{"kind":"Name","value":"password"}}},{"kind":"Argument","name":{"kind":"Name","value":"repeatPassword"},"value":{"kind":"Variable","name":{"kind":"Name","value":"repeatPassword"}}},{"kind":"Argument","name":{"kind":"Name","value":"turnstileToken"},"value":{"kind":"Variable","name":{"kind":"Name","value":"turnstileToken"}}}]}]}}]} as unknown as DocumentNode<UserRegisterMutation, UserRegisterMutationVariables>;
export const UserVerifyEmailResendDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UserVerifyEmailResend"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"turnstileToken"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userVerifyEmailResend"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}},{"kind":"Argument","name":{"kind":"Name","value":"turnstileToken"},"value":{"kind":"Variable","name":{"kind":"Name","value":"turnstileToken"}}}]}]}}]} as unknown as DocumentNode<UserVerifyEmailResendMutation, UserVerifyEmailResendMutationVariables>;
export const UserResetPwdDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UserResetPwd"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"turnstileToken"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userResetPwd"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}},{"kind":"Argument","name":{"kind":"Name","value":"turnstileToken"},"value":{"kind":"Variable","name":{"kind":"Name","value":"turnstileToken"}}}]}]}}]} as unknown as DocumentNode<UserResetPwdMutation, UserResetPwdMutationVariables>;
export const UserUpdatePwdDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UserUpdatePwd"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"hash"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"password"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"turnstileToken"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userUpdatePwd"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}},{"kind":"Argument","name":{"kind":"Name","value":"hash"},"value":{"kind":"Variable","name":{"kind":"Name","value":"hash"}}},{"kind":"Argument","name":{"kind":"Name","value":"password"},"value":{"kind":"Variable","name":{"kind":"Name","value":"password"}}},{"kind":"Argument","name":{"kind":"Name","value":"turnstileToken"},"value":{"kind":"Variable","name":{"kind":"Name","value":"turnstileToken"}}}]}]}}]} as unknown as DocumentNode<UserUpdatePwdMutation, UserUpdatePwdMutationVariables>;
export const CompaniesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Companies"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"city"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"companies"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"city"},"value":{"kind":"Variable","name":{"kind":"Name","value":"city"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"publicName"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"address"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"street"}},{"kind":"Field","name":{"kind":"Name","value":"postalCode"}},{"kind":"Field","name":{"kind":"Name","value":"city"}},{"kind":"Field","name":{"kind":"Name","value":"province"}},{"kind":"Field","name":{"kind":"Name","value":"position"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"total"}},{"kind":"Field","name":{"kind":"Name","value":"totalIsExact"}},{"kind":"Field","name":{"kind":"Name","value":"hasMore"}}]}}]}}]} as unknown as DocumentNode<CompaniesQuery, CompaniesQueryVariables>;
export const CompanyBySlugDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CompanyBySlug"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"slug"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"companyBySlug"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"slug"},"value":{"kind":"Variable","name":{"kind":"Name","value":"slug"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"publicName"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"address"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"street"}},{"kind":"Field","name":{"kind":"Name","value":"postalCode"}},{"kind":"Field","name":{"kind":"Name","value":"city"}},{"kind":"Field","name":{"kind":"Name","value":"province"}},{"kind":"Field","name":{"kind":"Name","value":"position"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"}}]}}]}}]}}]}}]} as unknown as DocumentNode<CompanyBySlugQuery, CompanyBySlugQueryVariables>;
export const CompaniesNearbyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CompaniesNearby"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"bbox"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputBoundingBox"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"near"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputNearPoint"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"companiesNearby"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"bbox"},"value":{"kind":"Variable","name":{"kind":"Name","value":"bbox"}}},{"kind":"Argument","name":{"kind":"Name","value":"near"},"value":{"kind":"Variable","name":{"kind":"Name","value":"near"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"publicName"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"position"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"}}]}},{"kind":"Field","name":{"kind":"Name","value":"distanceMeters"}}]}},{"kind":"Field","name":{"kind":"Name","value":"truncated"}}]}}]}}]} as unknown as DocumentNode<CompaniesNearbyQuery, CompaniesNearbyQueryVariables>;
export const ItemsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Items"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"companySlug"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"idCategory"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"items"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"companySlug"},"value":{"kind":"Variable","name":{"kind":"Name","value":"companySlug"}}},{"kind":"Argument","name":{"kind":"Name","value":"idCategory"},"value":{"kind":"Variable","name":{"kind":"Name","value":"idCategory"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"idCategory"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"companySlug"}},{"kind":"Field","name":{"kind":"Name","value":"companyPublicName"}}]}},{"kind":"Field","name":{"kind":"Name","value":"total"}},{"kind":"Field","name":{"kind":"Name","value":"totalIsExact"}},{"kind":"Field","name":{"kind":"Name","value":"hasMore"}}]}}]}}]} as unknown as DocumentNode<ItemsQuery, ItemsQueryVariables>;
export const ItemBySlugDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ItemBySlug"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"companySlug"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"slug"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itemBySlug"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"companySlug"},"value":{"kind":"Variable","name":{"kind":"Name","value":"companySlug"}}},{"kind":"Argument","name":{"kind":"Name","value":"slug"},"value":{"kind":"Variable","name":{"kind":"Name","value":"slug"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"idCategory"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"companySlug"}},{"kind":"Field","name":{"kind":"Name","value":"companyPublicName"}}]}}]}}]} as unknown as DocumentNode<ItemBySlugQuery, ItemBySlugQueryVariables>;
export const ItemCategoriesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ItemCategories"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"itemCategories"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"idParent"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"position"}}]}}]}}]} as unknown as DocumentNode<ItemCategoriesQuery, ItemCategoriesQueryVariables>;
export const SearchDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Search"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"q"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"near"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputNearPoint"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"search"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"q"},"value":{"kind":"Variable","name":{"kind":"Name","value":"q"}}},{"kind":"Argument","name":{"kind":"Name","value":"near"},"value":{"kind":"Variable","name":{"kind":"Name","value":"near"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"companies"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"publicName"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"address"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"street"}},{"kind":"Field","name":{"kind":"Name","value":"postalCode"}},{"kind":"Field","name":{"kind":"Name","value":"city"}},{"kind":"Field","name":{"kind":"Name","value":"province"}},{"kind":"Field","name":{"kind":"Name","value":"position"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"}}]}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"idCategory"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"slug"}},{"kind":"Field","name":{"kind":"Name","value":"companySlug"}},{"kind":"Field","name":{"kind":"Name","value":"companyPublicName"}}]}}]}}]}}]} as unknown as DocumentNode<SearchQuery, SearchQueryVariables>;
export const SitemapEntriesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SitemapEntries"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"kind"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLSitemapKind"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"afterId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sitemapEntries"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"kind"},"value":{"kind":"Variable","name":{"kind":"Name","value":"kind"}}},{"kind":"Argument","name":{"kind":"Name","value":"afterId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"afterId"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"nodes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"path"}}]}},{"kind":"Field","name":{"kind":"Name","value":"nextAfterId"}}]}}]}}]} as unknown as DocumentNode<SitemapEntriesQuery, SitemapEntriesQueryVariables>;