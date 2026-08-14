import { ShopOwnerRegisterDocument } from '@/api/operations/publicResource/mutations'
import { FormStatus } from '@/components/ui/FormStatus'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { TextField } from '@/components/ui/TextField'
import { Turnstile } from '@/components/ui/Turnstile'

import { PASSWORD_HINT } from './password'
import { useRegistration } from './useRegistration'

/**
 * Applies to sell here: email and password, nothing else.
 *
 * ⚠️ **This does not create a shop, and the account it does create cannot be logged into yet.** The
 * resolver writes `waitApprov: true`, and the shop-owner authorization service refuses a session while
 * that flag is up — so what this form starts is an application, which an operator either admits or does
 * not. Both screens below say so, and that is the whole reason they differ from the customer's: a
 * "check your inbox" that leads to a login refused with no explanation is indistinguishable from a
 * registration that silently failed.
 *
 * The company, the shop, the trading name and the catalogue are all collected later, in the shop-owner
 * app, once the account is approved. None of them belongs here: they are questions about a business that
 * may never be admitted, and the answers would be personal data held on an address nobody has confirmed.
 *
 * ⚠️ **The success screen is not "we sent you a mail", it is "if that address can be registered, we sent
 * you a mail"** — the same rule the customer's form follows, for the same reason. The mutation answers
 * `true` for an address that is already registered, and copy that distinguished the two cases would turn
 * this form into an account-enumeration oracle over the seller collection.
 */
export const SellerRegisterForm = () => {
	const { errors, failure, isSubmitting, onSubmit, register, sentTo, turnstile } = useRegistration(ShopOwnerRegisterDocument)

	if (sentTo !== undefined) {
		return (
			<div className="flex flex-col gap-3">
				<FormStatus tone="ok" message={`If ${sentTo} can be registered, an activation link is on its way.`} />

				<p className="text-sm text-slate-600">
					The link is good for three days. Check the spam folder before asking for another one — a second request replaces the
					first link, so an old mail stops working.
				</p>

				{/* The second half of the answer, and the half that is specific to a seller. Confirming the
				    address is not what opens the shop area: the account waits for an operator after that, and
				    somebody who is not told will read the refused login as a broken registration. */}
				<p className="text-sm text-slate-600">
					Confirming the address is the first of two steps. Our team reviews every application by hand, and you will hear from us
					at that address once your account has been approved — signing in before then is not possible.
				</p>
			</div>
		)
	}

	return (
		<form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
			<TextField {...register('email')} label="Email" type="email" autoComplete="username" error={errors.email?.message} />

			<TextField
				{...register('password')}
				label="Password"
				type="password"
				// `new-password` rather than `current-password`: it is what makes a password manager offer to
				// generate one instead of trying to fill in an existing entry.
				autoComplete="new-password"
				hint={PASSWORD_HINT}
				error={errors.password?.message}
			/>

			<TextField
				{...register('repeatPassword')}
				label="Repeat password"
				type="password"
				autoComplete="new-password"
				error={errors.repeatPassword?.message}
			/>

			<Turnstile onToken={turnstile.onToken} />

			<FormStatus tone="error" message={failure} />

			<SubmitButton busy={isSubmitting} busyLabel="Sending your application…">
				Apply to sell
			</SubmitButton>
		</form>
	)
}
