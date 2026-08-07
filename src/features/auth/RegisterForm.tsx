import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation } from 'urql'
import { z } from 'zod'

import { CTX_PUBLIC_RESOURCE } from '@/api/endpoints'
import { dataOf, messageOf } from '@/api/errors'
import { UserRegisterDocument } from '@/api/operations/publicResource/mutations'
import { FormStatus } from '@/components/ui/FormStatus'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { TextField } from '@/components/ui/TextField'
import { Turnstile } from '@/components/ui/Turnstile'

import { matchingPasswords, PASSWORD_HINT, passwordSchema } from './password'
import { useTurnstileToken } from './useTurnstileToken'

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
const schema = z
	.object({
		email: z.email('Enter a valid email address.'),
		password: passwordSchema,
		repeatPassword: z.string()
	})
	.superRefine(matchingPasswords)

type Values = z.infer<typeof schema>

export const RegisterForm = () => {
	const turnstile = useTurnstileToken()
	const [failure, setFailure] = useState<string | undefined>(undefined)
	const [sentTo, setSentTo] = useState<string | undefined>(undefined)
	const [, submit] = useMutation(UserRegisterDocument)

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting }
	} = useForm<Values>({ resolver: zodResolver(schema) })

	const onSubmit = handleSubmit(async (values) => {
		setFailure(undefined)

		const result = await submit({ ...values, turnstileToken: turnstile.read() }, CTX_PUBLIC_RESOURCE)

		// `dataOf` and not a bare `result.error` test: a `{"data": null}` envelope carries no error at all, and
		// telling someone to go and confirm an email nobody sent is worse than telling them it failed.
		if (dataOf(result) === undefined) {
			setFailure(messageOf(result.error))
			return
		}

		setSentTo(values.email)
	})

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
