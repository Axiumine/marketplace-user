import { graphql } from '@gql/publicAuthorization'

/**
 * Logs a customer in.
 *
 * ⚠️ `loginUser`, never `login` and never `loginAdmin`. All three live on this one endpoint and all
 * three have the identical signature, so sending the wrong one is a rename away and compiles: `login`
 * authenticates against the `shopOwner` collection and `loginAdmin` against `admin`. A customer's
 * address simply is not in either, so the mistake surfaces as "wrong credentials" for a correct
 * password — which reads as a backend bug and is not one.
 *
 * `LoginUserType` carries the access token and nothing else. There is no `onboardingStep` and no
 * `onboardingDone` on this tier: a customer self-serves, with no approval gate and no onboarding
 * wizard. The refresh token is never in the payload — the resolver sets it as a signed httpOnly cookie
 * that this code cannot read.
 *
 * `rememberMe` picks the cookie's lifetime server-side, session vs. 90 days. It is not a client-side
 * "stay signed in" checkbox that this app then honours; the value decides what the browser is given.
 *
 * ⚠️ `turnstileToken` is nullable and is the one argument `login` and `loginAdmin` do not take. It is
 * nullable because the widget renders nothing when no site key is configured — the normal state of a
 * developer machine — and the server verifies a token only when it holds a secret of its own. Omitting
 * it cannot weaken the gate on a deployment that has one; it can only fail to satisfy it.
 */
export const LoginUserDocument = graphql(`
	mutation LoginUser($email: String!, $password: String!, $rememberMe: Boolean!, $turnstileToken: String) {
		loginUser(email: $email, password: $password, rememberMe: $rememberMe, turnstileToken: $turnstileToken) {
			accessToken
		}
	}
`)
