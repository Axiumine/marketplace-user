import { graphql } from '@gql/userResource'

/**
 * The private area's only query, and the whole account in one round trip.
 *
 * ⚠️ It takes no arguments, and none may ever be added. The resolver reads the customer from
 * `ctx.state.user._id` — the Redis session behind the access token. An id in the variable set would
 * mean asking the backend to accept from a browser the one thing the session already proves.
 *
 * `personalData` is nullable: registration is email + password only, so a freshly activated account has
 * none and the profile screen is the one that fills it in. Every consumer has to handle the null — it
 * is not "not loaded yet", it is a real state a real account sits in.
 *
 * `defaultAddress` is an id pointing into `addresses[]`, not a flag on an element. "Is this the default
 * one?" is `address._id === me.defaultAddress`. That shape is what makes a second default unrepresentable
 * rather than merely forbidden; see README §4.1.
 */
export const MeDocument = graphql(`
	query Me {
		me {
			_id
			email
			registeredAt
			defaultAddress
			personalData {
				firstName
				lastName
				birth {
					date
				}
				contacts {
					mobile
					landline
					email
				}
			}
			addresses {
				_id
				label
				street
				postalCode
				city
				province
				position {
					type
					coordinates
				}
			}
		}
	}
`)
