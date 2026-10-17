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
    "\n  mutation UserAddressAdd($address: GraphQLInputUserAddress!) {\n    userAddressAdd(address: $address) {\n      _id\n    }\n  }\n": typeof types.UserAddressAddDocument,
    "\n  mutation UserAddressUpdate($_id: ID!, $address: GraphQLInputUserAddress!) {\n    userAddressUpdate(_id: $_id, address: $address)\n  }\n": typeof types.UserAddressUpdateDocument,
    "\n  mutation UserAddressDel($_id: ID!) {\n    userAddressDel(_id: $_id)\n  }\n": typeof types.UserAddressDelDocument,
    "\n  mutation UserDefaultAddressSet($_id: ID!) {\n    userDefaultAddressSet(_id: $_id)\n  }\n": typeof types.UserDefaultAddressSetDocument,
    "\n  mutation UserPersonalDataUpdate($personalData: GraphQLInputUserPersonalData!) {\n    userPersonalDataUpdate(personalData: $personalData)\n  }\n": typeof types.UserPersonalDataUpdateDocument,
    "\n  mutation UserUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n    userUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n  }\n": typeof types.UserUpdatePwdDocument,
    "\n  mutation UserDel {\n    userDel\n  }\n": typeof types.UserDelDocument,
    "\n  query Me {\n    me {\n      _id\n      email\n      registeredAt\n      defaultAddress\n      personalData {\n        firstName\n        lastName\n        birth {\n          date\n        }\n        contacts {\n          mobile\n          landline\n          email\n        }\n      }\n      addresses {\n        _id\n        label\n        street\n        postalCode\n        city\n        province\n        position {\n          type\n          coordinates\n        }\n      }\n    }\n  }\n": typeof types.MeDocument,
};
const documents: Documents = {
    "\n  mutation UserAddressAdd($address: GraphQLInputUserAddress!) {\n    userAddressAdd(address: $address) {\n      _id\n    }\n  }\n": types.UserAddressAddDocument,
    "\n  mutation UserAddressUpdate($_id: ID!, $address: GraphQLInputUserAddress!) {\n    userAddressUpdate(_id: $_id, address: $address)\n  }\n": types.UserAddressUpdateDocument,
    "\n  mutation UserAddressDel($_id: ID!) {\n    userAddressDel(_id: $_id)\n  }\n": types.UserAddressDelDocument,
    "\n  mutation UserDefaultAddressSet($_id: ID!) {\n    userDefaultAddressSet(_id: $_id)\n  }\n": types.UserDefaultAddressSetDocument,
    "\n  mutation UserPersonalDataUpdate($personalData: GraphQLInputUserPersonalData!) {\n    userPersonalDataUpdate(personalData: $personalData)\n  }\n": types.UserPersonalDataUpdateDocument,
    "\n  mutation UserUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n    userUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n  }\n": types.UserUpdatePwdDocument,
    "\n  mutation UserDel {\n    userDel\n  }\n": types.UserDelDocument,
    "\n  query Me {\n    me {\n      _id\n      email\n      registeredAt\n      defaultAddress\n      personalData {\n        firstName\n        lastName\n        birth {\n          date\n        }\n        contacts {\n          mobile\n          landline\n          email\n        }\n      }\n      addresses {\n        _id\n        label\n        street\n        postalCode\n        city\n        province\n        position {\n          type\n          coordinates\n        }\n      }\n    }\n  }\n": types.MeDocument,
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
export function graphql(source: "\n  mutation UserAddressAdd($address: GraphQLInputUserAddress!) {\n    userAddressAdd(address: $address) {\n      _id\n    }\n  }\n"): (typeof documents)["\n  mutation UserAddressAdd($address: GraphQLInputUserAddress!) {\n    userAddressAdd(address: $address) {\n      _id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UserAddressUpdate($_id: ID!, $address: GraphQLInputUserAddress!) {\n    userAddressUpdate(_id: $_id, address: $address)\n  }\n"): (typeof documents)["\n  mutation UserAddressUpdate($_id: ID!, $address: GraphQLInputUserAddress!) {\n    userAddressUpdate(_id: $_id, address: $address)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UserAddressDel($_id: ID!) {\n    userAddressDel(_id: $_id)\n  }\n"): (typeof documents)["\n  mutation UserAddressDel($_id: ID!) {\n    userAddressDel(_id: $_id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UserDefaultAddressSet($_id: ID!) {\n    userDefaultAddressSet(_id: $_id)\n  }\n"): (typeof documents)["\n  mutation UserDefaultAddressSet($_id: ID!) {\n    userDefaultAddressSet(_id: $_id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UserPersonalDataUpdate($personalData: GraphQLInputUserPersonalData!) {\n    userPersonalDataUpdate(personalData: $personalData)\n  }\n"): (typeof documents)["\n  mutation UserPersonalDataUpdate($personalData: GraphQLInputUserPersonalData!) {\n    userPersonalDataUpdate(personalData: $personalData)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UserUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n    userUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n  }\n"): (typeof documents)["\n  mutation UserUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n    userUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UserDel {\n    userDel\n  }\n"): (typeof documents)["\n  mutation UserDel {\n    userDel\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Me {\n    me {\n      _id\n      email\n      registeredAt\n      defaultAddress\n      personalData {\n        firstName\n        lastName\n        birth {\n          date\n        }\n        contacts {\n          mobile\n          landline\n          email\n        }\n      }\n      addresses {\n        _id\n        label\n        street\n        postalCode\n        city\n        province\n        position {\n          type\n          coordinates\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query Me {\n    me {\n      _id\n      email\n      registeredAt\n      defaultAddress\n      personalData {\n        firstName\n        lastName\n        birth {\n          date\n        }\n        contacts {\n          mobile\n          landline\n          email\n        }\n      }\n      addresses {\n        _id\n        label\n        street\n        postalCode\n        city\n        province\n        position {\n          type\n          coordinates\n        }\n      }\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;