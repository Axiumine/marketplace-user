import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation } from 'urql'
import { z } from 'zod'

import { messageOf } from '@/api/errors'
import { UserUpdatePwdDocument } from '@/api/operations/userResource/mutations'
import { FormStatus } from '@/components/ui/FormStatus'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { TextField } from '@/components/ui/TextField'
import { matchingPasswords, PASSWORD_HINT, passwordSchema } from '@/features/auth/password'

import { CTX_ACCOUNT_WRITE } from './invalidate'

/**
 * Changes the password of a signed-in customer.
 *
 * ⚠️ **`UserUpdatePwdDocument` from `operations/userResource/`, not the identically named one in
 * `operations/publicResource/`.** Two different mutations share that name across two services: the public
 * one consumes an emailed reset hash, this one takes the current password. Importing the wrong module
 * compiles and then fails at runtime on variables the other resolver has never heard of. The import path
 * is the only thing that distinguishes them.
 *
 * ⚠️ **The session deliberately stays alive afterwards.** Requiring `passwordOld` is what makes that
 * safe: somebody holding a stolen access token cannot change the password without also knowing the old
 * one, so there is no session to defend against here — and signing the customer out of the tab they are
 * standing in, right after they did the responsible thing, teaches them not to do it again. It does mean
 * *other* sessions survive too. Revoking them needs a server-side sweep of that customer's Redis keys,
 * which the tier does not expose; a "sign out everywhere" control is the follow-up, not a silent
 * side effect of this form.
 *
 * The new password is length-checked here with the same schema registration uses. That is safe on a form
 * only a signed-in customer can reach — there is no account to enumerate, they already have one.
 */
const schema = z
	.object({
		passwordOld: z.string().min(1, 'Enter your current password.'),
		password: passwordSchema,
		repeatPassword: z.string()
	})
	.superRefine(matchingPasswords)

type Values = z.infer<typeof schema>

export const ChangePasswordForm = () => {
	const [status, setStatus] = useState<{ readonly tone: 'ok' | 'error'; readonly message: string } | undefined>(undefined)
	const [, submit] = useMutation(UserUpdatePwdDocument)

	const {
		register,
		handleSubmit,
		reset,
		formState: { errors, isSubmitting }
	} = useForm<Values>({
		resolver: zodResolver(schema),
		defaultValues: { passwordOld: '', password: '', repeatPassword: '' }
	})

	const onSubmit = handleSubmit(async (values) => {
		setStatus(undefined)

		const result = await submit({ passwordOld: values.passwordOld, passwordNew: values.password }, CTX_ACCOUNT_WRITE)

		if (result.error !== undefined || result.data === undefined) {
			setStatus({ tone: 'error', message: messageOf(result.error) })
			return
		}

		// Cleared on success only. After a failure the fields keep what was typed, because the likeliest
		// cause is a mistyped *old* password and retyping all three to fix one of them is punishment.
		reset({ passwordOld: '', password: '', repeatPassword: '' })
		setStatus({ tone: 'ok', message: 'Your password has been changed.' })
	})

	return (
		<form onSubmit={onSubmit} noValidate className="flex max-w-md flex-col gap-4">
			<TextField
				{...register('passwordOld')}
				label="Current password"
				type="password"
				autoComplete="current-password"
				error={errors.passwordOld?.message}
			/>

			<TextField
				{...register('password')}
				label="New password"
				type="password"
				autoComplete="new-password"
				hint={PASSWORD_HINT}
				error={errors.password?.message}
			/>

			<TextField
				{...register('repeatPassword')}
				label="Repeat new password"
				type="password"
				autoComplete="new-password"
				error={errors.repeatPassword?.message}
			/>

			<FormStatus tone={status?.tone ?? 'error'} message={status?.message} />

			<div>
				<SubmitButton busy={isSubmitting} busyLabel="Saving…">
					Change password
				</SubmitButton>
			</div>
		</form>
	)
}
