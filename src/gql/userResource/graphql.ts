/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type GraphQlInputUserAddress = {
  city: string;
  label?: string | null | undefined;
  position?: GraphQlInputUserAddressPosition | null | undefined;
  postalCode: string;
  province: string;
  street: string;
};

export type GraphQlInputUserAddressPosition = {
  coordinates: Array<number>;
};

export type GraphQlInputUserBirth = {
  date: string;
};

export type GraphQlInputUserContacts = {
  email?: string | null | undefined;
  landline?: string | null | undefined;
  mobile?: string | null | undefined;
};

export type GraphQlInputUserPersonalData = {
  birth?: GraphQlInputUserBirth | null | undefined;
  contacts?: GraphQlInputUserContacts | null | undefined;
  firstName: string;
  lastName: string;
};

export type UserAddressAddMutationVariables = Exact<{
  address: GraphQlInputUserAddress;
}>;


export type UserAddressAddMutation = { userAddressAdd: { _id: string } };

export type UserAddressUpdateMutationVariables = Exact<{
  _id: string | number;
  address: GraphQlInputUserAddress;
}>;


export type UserAddressUpdateMutation = { userAddressUpdate: boolean };

export type UserAddressDelMutationVariables = Exact<{
  _id: string | number;
}>;


export type UserAddressDelMutation = { userAddressDel: boolean };

export type UserDefaultAddressSetMutationVariables = Exact<{
  _id: string | number;
}>;


export type UserDefaultAddressSetMutation = { userDefaultAddressSet: boolean };

export type UserPersonalDataUpdateMutationVariables = Exact<{
  personalData: GraphQlInputUserPersonalData;
}>;


export type UserPersonalDataUpdateMutation = { userPersonalDataUpdate: boolean };

export type UserUpdatePwdMutationVariables = Exact<{
  passwordOld: string;
  passwordNew: string;
}>;


export type UserUpdatePwdMutation = { userUpdatePwd: boolean };

export type UserDelMutationVariables = Exact<{ [key: string]: never; }>;


export type UserDelMutation = { userDel: boolean };

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { me: { _id: string, email: string, registeredAt: string, defaultAddress: string | null, personalData: { firstName: string, lastName: string, birth: { date: string } | null, contacts: { mobile: string | null, landline: string | null, email: string | null } | null } | null, addresses: Array<{ _id: string, label: string | null, street: string, postalCode: string, city: string, province: string, position: { type: string, coordinates: Array<number> } | null }> } };


export const UserAddressAddDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UserAddressAdd"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"address"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputUserAddress"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userAddressAdd"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"address"},"value":{"kind":"Variable","name":{"kind":"Name","value":"address"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}}]}}]}}]} as unknown as DocumentNode<UserAddressAddMutation, UserAddressAddMutationVariables>;
export const UserAddressUpdateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UserAddressUpdate"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"address"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputUserAddress"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userAddressUpdate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}},{"kind":"Argument","name":{"kind":"Name","value":"address"},"value":{"kind":"Variable","name":{"kind":"Name","value":"address"}}}]}]}}]} as unknown as DocumentNode<UserAddressUpdateMutation, UserAddressUpdateMutationVariables>;
export const UserAddressDelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UserAddressDel"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userAddressDel"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}}]}]}}]} as unknown as DocumentNode<UserAddressDelMutation, UserAddressDelMutationVariables>;
export const UserDefaultAddressSetDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UserDefaultAddressSet"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"_id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userDefaultAddressSet"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"_id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"_id"}}}]}]}}]} as unknown as DocumentNode<UserDefaultAddressSetMutation, UserDefaultAddressSetMutationVariables>;
export const UserPersonalDataUpdateDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UserPersonalDataUpdate"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"personalData"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"GraphQLInputUserPersonalData"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userPersonalDataUpdate"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"personalData"},"value":{"kind":"Variable","name":{"kind":"Name","value":"personalData"}}}]}]}}]} as unknown as DocumentNode<UserPersonalDataUpdateMutation, UserPersonalDataUpdateMutationVariables>;
export const UserUpdatePwdDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UserUpdatePwd"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"passwordOld"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"passwordNew"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userUpdatePwd"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"passwordOld"},"value":{"kind":"Variable","name":{"kind":"Name","value":"passwordOld"}}},{"kind":"Argument","name":{"kind":"Name","value":"passwordNew"},"value":{"kind":"Variable","name":{"kind":"Name","value":"passwordNew"}}}]}]}}]} as unknown as DocumentNode<UserUpdatePwdMutation, UserUpdatePwdMutationVariables>;
export const UserDelDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UserDel"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userDel"}}]}}]} as unknown as DocumentNode<UserDelMutation, UserDelMutationVariables>;
export const MeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"registeredAt"}},{"kind":"Field","name":{"kind":"Name","value":"defaultAddress"}},{"kind":"Field","name":{"kind":"Name","value":"personalData"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"firstName"}},{"kind":"Field","name":{"kind":"Name","value":"lastName"}},{"kind":"Field","name":{"kind":"Name","value":"birth"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"date"}}]}},{"kind":"Field","name":{"kind":"Name","value":"contacts"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"mobile"}},{"kind":"Field","name":{"kind":"Name","value":"landline"}},{"kind":"Field","name":{"kind":"Name","value":"email"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"addresses"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"_id"}},{"kind":"Field","name":{"kind":"Name","value":"label"}},{"kind":"Field","name":{"kind":"Name","value":"street"}},{"kind":"Field","name":{"kind":"Name","value":"postalCode"}},{"kind":"Field","name":{"kind":"Name","value":"city"}},{"kind":"Field","name":{"kind":"Name","value":"province"}},{"kind":"Field","name":{"kind":"Name","value":"position"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"coordinates"}}]}}]}}]}}]}}]} as unknown as DocumentNode<MeQuery, MeQueryVariables>;