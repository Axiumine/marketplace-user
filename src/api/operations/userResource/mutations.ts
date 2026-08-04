import { graphql } from '@gql/userResource'

/**
 * The private area's writes. None of them takes a customer id, and none ever should — see the note on
 * `MeDocument`. The `_id` arguments below are **subdocument** ids inside the caller's own `addresses`
 * array, and `throwIfUserDontOwnAddress` checks each against the session before any write.
 *
 * ⚠️ Every one of these answers a bare `Boolean` or an `OnlyIdType`, so urql's document cache
 * invalidates **nothing** on its own: the cache keys off the `__typename`s a mutation's *response*
 * mentions, and none of these responses mentions `GraphQLUserMe`. Every call site must pass
 * `additionalTypenames: ['GraphQLUserMe']` in the operation context, or the account screen keeps
 * rendering the pre-mutation answer until a reload. This is the single most repeated bug in the two
 * sibling apps.
 */

/**
 * ⚠️ `position` carries `coordinates` only. The resolver stamps `type: 'Point'` server-side
 * (`validateUserAddress.mts`), and the input type has no `type` field to send it in.
 *
 * This is the **opposite** of `marketplace-shopowner`, where `GraphQLInputCompanyPosition` requires
 * `type: String!` because no server-side stamp exists on that tier. Both are correct against their own
 * resolver; copying either one across breaks it. Do not "align" them.
 */
export const UserAddressAddDocument = graphql(`
	mutation UserAddressAdd($address: GraphQLInputUserAddress!) {
		userAddressAdd(address: $address) {
			_id
		}
	}
`)

export const UserAddressUpdateDocument = graphql(`
	mutation UserAddressUpdate($_id: ID!, $address: GraphQLInputUserAddress!) {
		userAddressUpdate(_id: $_id, address: $address)
	}
`)

/**
 * Deleting the default address also unsets `defaultAddress`, in the same update, server-side.
 *
 * That is not tidiness: the collection validator carries an `$expr` refusing any document whose
 * `defaultAddress` is not one of its own `addresses[]._id`, so a delete that left the pointer behind
 * would be rejected by the database. The rule is enforced where it cannot be forgotten rather than in a
 * code path someone has to remember.
 */
export const UserAddressDelDocument = graphql(`
	mutation UserAddressDel($_id: ID!) {
		userAddressDel(_id: $_id)
	}
`)

/**
 * One atomic `$set` of a top-level field.
 *
 * There is no "clear every other address, then set this one" step, and no transaction, because the
 * default is a pointer rather than a flag per element. A concurrent write cannot interleave into a
 * state with two defaults or none — that state is not expressible.
 */
export const UserDefaultAddressSetDocument = graphql(`
	mutation UserDefaultAddressSet($_id: ID!) {
		userDefaultAddressSet(_id: $_id)
	}
`)

/**
 * `birth.date` goes out as `Date` (`YYYY-MM-DD`, what an `<input type="date">` produces) and comes back
 * from `me` as `DateTime`. Both are mapped to `string` in codegen.ts; the asymmetry is the resolver's,
 * not a mistake in the slice.
 */
export const UserPersonalDataUpdateDocument = graphql(`
	mutation UserPersonalDataUpdate($personalData: GraphQLInputUserPersonalData!) {
		userPersonalDataUpdate(personalData: $personalData)
	}
`)

/**
 * Requires the current password, which is what makes it safe to leave the session alive afterwards: an
 * attacker sitting on a stolen access token cannot change the password without also knowing the old
 * one.
 */
export const UserUpdatePwdDocument = graphql(`
	mutation UserUpdatePwd($passwordOld: String!, $passwordNew: String!) {
		userUpdatePwd(passwordOld: $passwordOld, passwordNew: $passwordNew)
	}
`)
