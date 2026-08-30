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
    "\n\tmutation UserAddressAdd($address: GraphQLInputUserAddress!) {\n\t\tuserAddressAdd(address: $address) {\n\t\t\t_id\n\t\t}\n\t}\n": typeof types.UserAddressAddDocument,
    "\n\tmutation UserAddressUpdate($_id: ID!, $address: GraphQLInputUserAddress!) {\n\t\tuserAddressUpdate(_id: $_id, address: $address)\n\t}\n": typeof types.UserAddressUpdateDocument,
    "\n\tmutation UserAddressDel($_id: ID!) {\n\t\tuserAddressDel(_id: $_id)\n\t}\n": typeof types.UserAddressDelDocument,
    "\n\tmutation UserDefaultAddressSet($_id: ID!) {\n\t\tuserDefaultAddressSet(_id: $_id)\n\t}\n": typeof types.UserDefaultAddressSetDocument,
    "\n\tmutation UserPersonalDataUpdate($personalData: GraphQLInputUserPersonalData!) {\n\t\tuserPersonalDataUpdate(personalData: $personalData)\n\t}\n": typeof types.UserPersonalDataUpdateDocument,
    "\n\tmutation UserUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n\t\tuserUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n\t}\n": typeof types.UserUpdatePwdDocument,
    "\n\tmutation UserDel {\n\t\tuserDel\n\t}\n": typeof types.UserDelDocument,
    "\n\tquery Me {\n\t\tme {\n\t\t\t_id\n\t\t\temail\n\t\t\tregisteredAt\n\t\t\tdefaultAddress\n\t\t\tpersonalData {\n\t\t\t\tfirstName\n\t\t\t\tlastName\n\t\t\t\tbirth {\n\t\t\t\t\tdate\n\t\t\t\t}\n\t\t\t\tcontacts {\n\t\t\t\t\tmobile\n\t\t\t\t\tlandline\n\t\t\t\t\temail\n\t\t\t\t}\n\t\t\t}\n\t\t\taddresses {\n\t\t\t\t_id\n\t\t\t\tlabel\n\t\t\t\tstreet\n\t\t\t\tpostalCode\n\t\t\t\tcity\n\t\t\t\tprovince\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n": typeof types.MeDocument,
};
const documents: Documents = {
    "\n\tmutation UserAddressAdd($address: GraphQLInputUserAddress!) {\n\t\tuserAddressAdd(address: $address) {\n\t\t\t_id\n\t\t}\n\t}\n": types.UserAddressAddDocument,
    "\n\tmutation UserAddressUpdate($_id: ID!, $address: GraphQLInputUserAddress!) {\n\t\tuserAddressUpdate(_id: $_id, address: $address)\n\t}\n": types.UserAddressUpdateDocument,
    "\n\tmutation UserAddressDel($_id: ID!) {\n\t\tuserAddressDel(_id: $_id)\n\t}\n": types.UserAddressDelDocument,
    "\n\tmutation UserDefaultAddressSet($_id: ID!) {\n\t\tuserDefaultAddressSet(_id: $_id)\n\t}\n": types.UserDefaultAddressSetDocument,
    "\n\tmutation UserPersonalDataUpdate($personalData: GraphQLInputUserPersonalData!) {\n\t\tuserPersonalDataUpdate(personalData: $personalData)\n\t}\n": types.UserPersonalDataUpdateDocument,
    "\n\tmutation UserUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n\t\tuserUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n\t}\n": types.UserUpdatePwdDocument,
    "\n\tmutation UserDel {\n\t\tuserDel\n\t}\n": types.UserDelDocument,
    "\n\tquery Me {\n\t\tme {\n\t\t\t_id\n\t\t\temail\n\t\t\tregisteredAt\n\t\t\tdefaultAddress\n\t\t\tpersonalData {\n\t\t\t\tfirstName\n\t\t\t\tlastName\n\t\t\t\tbirth {\n\t\t\t\t\tdate\n\t\t\t\t}\n\t\t\t\tcontacts {\n\t\t\t\t\tmobile\n\t\t\t\t\tlandline\n\t\t\t\t\temail\n\t\t\t\t}\n\t\t\t}\n\t\t\taddresses {\n\t\t\t\t_id\n\t\t\t\tlabel\n\t\t\t\tstreet\n\t\t\t\tpostalCode\n\t\t\t\tcity\n\t\t\t\tprovince\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n": types.MeDocument,
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
export function graphql(source: "\n\tmutation UserAddressAdd($address: GraphQLInputUserAddress!) {\n\t\tuserAddressAdd(address: $address) {\n\t\t\t_id\n\t\t}\n\t}\n"): (typeof documents)["\n\tmutation UserAddressAdd($address: GraphQLInputUserAddress!) {\n\t\tuserAddressAdd(address: $address) {\n\t\t\t_id\n\t\t}\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation UserAddressUpdate($_id: ID!, $address: GraphQLInputUserAddress!) {\n\t\tuserAddressUpdate(_id: $_id, address: $address)\n\t}\n"): (typeof documents)["\n\tmutation UserAddressUpdate($_id: ID!, $address: GraphQLInputUserAddress!) {\n\t\tuserAddressUpdate(_id: $_id, address: $address)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation UserAddressDel($_id: ID!) {\n\t\tuserAddressDel(_id: $_id)\n\t}\n"): (typeof documents)["\n\tmutation UserAddressDel($_id: ID!) {\n\t\tuserAddressDel(_id: $_id)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation UserDefaultAddressSet($_id: ID!) {\n\t\tuserDefaultAddressSet(_id: $_id)\n\t}\n"): (typeof documents)["\n\tmutation UserDefaultAddressSet($_id: ID!) {\n\t\tuserDefaultAddressSet(_id: $_id)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation UserPersonalDataUpdate($personalData: GraphQLInputUserPersonalData!) {\n\t\tuserPersonalDataUpdate(personalData: $personalData)\n\t}\n"): (typeof documents)["\n\tmutation UserPersonalDataUpdate($personalData: GraphQLInputUserPersonalData!) {\n\t\tuserPersonalDataUpdate(personalData: $personalData)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation UserUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n\t\tuserUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n\t}\n"): (typeof documents)["\n\tmutation UserUpdatePwd($passwordOld: String!, $passwordNew: String!) {\n\t\tuserUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tmutation UserDel {\n\t\tuserDel\n\t}\n"): (typeof documents)["\n\tmutation UserDel {\n\t\tuserDel\n\t}\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n\tquery Me {\n\t\tme {\n\t\t\t_id\n\t\t\temail\n\t\t\tregisteredAt\n\t\t\tdefaultAddress\n\t\t\tpersonalData {\n\t\t\t\tfirstName\n\t\t\t\tlastName\n\t\t\t\tbirth {\n\t\t\t\t\tdate\n\t\t\t\t}\n\t\t\t\tcontacts {\n\t\t\t\t\tmobile\n\t\t\t\t\tlandline\n\t\t\t\t\temail\n\t\t\t\t}\n\t\t\t}\n\t\t\taddresses {\n\t\t\t\t_id\n\t\t\t\tlabel\n\t\t\t\tstreet\n\t\t\t\tpostalCode\n\t\t\t\tcity\n\t\t\t\tprovince\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n"): (typeof documents)["\n\tquery Me {\n\t\tme {\n\t\t\t_id\n\t\t\temail\n\t\t\tregisteredAt\n\t\t\tdefaultAddress\n\t\t\tpersonalData {\n\t\t\t\tfirstName\n\t\t\t\tlastName\n\t\t\t\tbirth {\n\t\t\t\t\tdate\n\t\t\t\t}\n\t\t\t\tcontacts {\n\t\t\t\t\tmobile\n\t\t\t\t\tlandline\n\t\t\t\t\temail\n\t\t\t\t}\n\t\t\t}\n\t\t\taddresses {\n\t\t\t\t_id\n\t\t\t\tlabel\n\t\t\t\tstreet\n\t\t\t\tpostalCode\n\t\t\t\tcity\n\t\t\t\tprovince\n\t\t\t\tposition {\n\t\t\t\t\ttype\n\t\t\t\t\tcoordinates\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;