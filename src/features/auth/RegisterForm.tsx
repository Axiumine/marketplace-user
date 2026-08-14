import { UserRegisterDocument } from '@/api/operations/publicResource/mutations'
import { FormStatus } from '@/components/ui/FormStatus'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { TextField } from '@/components/ui/TextField'
import { Turnstile } from '@/components/ui/Turnstile'

import { PASSWORD_HINT } from './password'
import { useRegistration } from './useRegistration'

/**
 * Creates an account: email and password, nothing else.
 *
 * Name, phone number and addresses are collected *after* the address is confirmed, in the account area.
 * Asking for them here would put a wall of fields in front of somebody who has not yet decided to stay,
 * and it would collect personal data about an address that may never be verified — which is data the
 * platform would then hold with no lawful basis to keep.
 *
 * ⚠️ **The success screen is not "we sent you a mail", it is "if that address can be registered, we
 * sent you a mail".** The mutation answers `true` for an address that is already registered, and the
 * copy has to match: a message that said "check your inbox" for a new address and "already taken" for an
 * existing one would turn this form into an account-enumeration oracle, which is the whole reason the
 * resolver refuses to distinguish them.
 */
export const RegisterForm = () => {
	const { errors, failure, isSubmitting, onSubmit, register, sentTo, turnstile } = useRegistration(UserRegisterDocument)

	if (sentTo !== undefined) {
		return (
			<div className="flex flex-col gap-3">
				<FormStatus tone="ok" message={`If ${sentTo} can be registered, an activation link is on its way.`} />

				<p className="text-sm text-slate-600">
					The link is good for three days. Check the spam folder before asking for another one — a second request replaces the
					first link, so an old mail stops working.
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

			<SubmitButton busy={isSubmitting} busyLabel="Creating your account…">
				Create account
			</SubmitButton>
		</form>
	)
}
