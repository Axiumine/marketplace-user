import { graphql } from '@gql/publicResource'

/**
 * The four anonymous mutations: registration, activation resend, and the two halves of password
 * recovery. All of them are rate-limited server-side and all four take a Turnstile token where one is
 * configured.
 *
 * ⚠️ Every one answers a bare `Boolean` and answers `true` for cases that are not successes — an
 * address that is already registered, an address that does not exist. That is deliberate on the backend
 * and must not be "improved" here: a mutation that distinguished them would be an account-enumeration
 * oracle, and the UI copy has to stay vague to match ("if that address is registered, we have sent…").
 */

/**
 * Creates the account and sends the activation link.
 *
 * `repeatPassword` is sent to the server even though the form already compared the two. The check
 * belongs on both sides: the client one is for the person typing, the server one is the one that holds
 * when the request does not come from this form.
 *
 * `turnstileToken` is nullable because the widget is disabled when no site key is configured, which is
 * the normal state of a developer machine. The server treats a missing token as a failure only when it
 * has a secret key of its own.
 */
export const UserRegisterDocument = graphql(`
	mutation UserRegister($email: String!, $password: String!, $repeatPassword: String!, $turnstileToken: String) {
		userRegister(email: $email, password: $password, repeatPassword: $repeatPassword, turnstileToken: $turnstileToken)
	}
`)

/**
 * Creates a **shop owner** account and sends its activation link. Same four arguments as the customer's,
 * a different collection and a different outcome.
 *
 * ⚠️ **The account cannot be logged into afterwards.** `shopOwnerRegister` writes `waitApprov: true` and
 * the authorization service refuses a session while the flag is up, so this form is a seller *asking* to
 * sell here rather than becoming one — selling is a commercial relationship with the operator, and no
 * form may open it. The screen has to say so, because "check your inbox" followed by a login that is
 * refused with no explanation reads as a broken registration.
 *
 * ⚠️ **`shopOwnerRegister`, never `userRegister`.** The two take identical arguments and both answer
 * `true` for an address they will not act on, so calling the wrong one is invisible from here: the caller
 * cannot see which collection was written or which origin the mailed link was built on. A seller
 * registered through the customer's mutation gets a customer account and a link into an app with no
 * panel for them.
 */
export const ShopOwnerRegisterDocument = graphql(`
	mutation ShopOwnerRegister($email: String!, $password: String!, $repeatPassword: String!, $turnstileToken: String) {
		shopOwnerRegister(email: $email, password: $password, repeatPassword: $repeatPassword, turnstileToken: $turnstileToken)
	}
`)

/** Re-sends the activation link. Offered on the "check your inbox" screen and on a failed login. */
export const UserVerifyEmailResendDocument = graphql(`
	mutation UserVerifyEmailResend($email: String!, $turnstileToken: String) {
		userVerifyEmailResend(email: $email, turnstileToken: $turnstileToken)
	}
`)

/**
 * Sends the password-reset link.
 *
 * ⚠️ **`userResetPwd`, never `resetPwd`.** The public-resource service exposes both, they take the same
 * arguments and both answer `true` for an address they cannot find — so calling the wrong one looks
 * exactly like calling the right one for an address that is not registered. They differ in two things a
 * caller cannot see: the collection they query (`user` vs `shopOwner`), and the origin the emailed link
 * is built on (`APP_DOMAIN_USER` vs `APP_DOMAIN`). A customer sent the shop-owner link lands on a panel
 * that cannot complete the reset.
 *
 * The server cannot pick for us. By the time the resolver holds an email and a hash, the two collections
 * behind that one process are indistinguishable — which is why the choice is a field name.
 */
export const UserResetPwdDocument = graphql(`
	mutation UserResetPwd($email: String!, $turnstileToken: String) {
		userResetPwd(email: $email, turnstileToken: $turnstileToken)
	}
`)

/**
 * The second half: consumes the emailed hash and sets the new password.
 *
 * ⚠️ The hash is good for **60 minutes**, not the three days the activation link gets. The screen has to
 * say so, because the failure is a flat 403 that reads identically to a wrong hash.
 */
export const UserUpdatePwdDocument = graphql(`
	mutation UserUpdatePwd($email: String!, $hash: String!, $password: String!, $turnstileToken: String) {
		userUpdatePwd(email: $email, hash: $hash, password: $password, turnstileToken: $turnstileToken)
	}
`)
