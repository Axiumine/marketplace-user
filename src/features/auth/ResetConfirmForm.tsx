import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation } from 'urql'
import { z } from 'zod'

import { CTX_PUBLIC_RESOURCE } from '@/api/endpoints'
import { messageOf } from '@/api/errors'
import { UserUpdatePwdDocument } from '@/api/operations/publicResource/mutations'
import { FormStatus } from '@/components/ui/FormStatus'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { TextField } from '@/components/ui/TextField'
import { Turnstile } from '@/components/ui/Turnstile'

import { matchingPasswords, PASSWORD_HINT, passwordSchema } from './password'
import { useTurnstileToken } from './useTurnstileToken'

/**
 * The second half of the reset: consumes the emailed hash and sets the new password.
 *
 * The email and the hash come from the URL rather than from fields, because they came from the link the
 * customer clicked. Neither is rendered — the address would be readable over a shoulder, and the hash is
 * a one-time credential that has no business being selectable and copyable off the page.
 *
 * ⚠️ **Every failure here arrives as the same flat 403**, whether the hash is wrong, already used, or
 * simply older than 60 minutes. The server cannot distinguish them for us without saying whether the
 * address exists, so the copy has to name the likely cause and offer the way out rather than pretending
 * to diagnose it.
 *
 * On success it does *not* sign the customer in. Completing a reset proves control of the inbox, not of
 * the password that was just set — and an automatic sign-in would hand a session to whoever opened the
 * mail. They go to the login form and use what they typed.
 */
const schema = z.object({ password: passwordSchema, repeatPassword: z.string() }).superRefine(matchingPasswords)

type Values = z.infer<typeof schema>

export interface ResetConfirmFormProps {
	readonly email: string
	readonly hash: string
}

export const ResetConfirmForm = ({ email, hash }: ResetConfirmFormProps) => {
	const turnstile = useTurnstileToken()
	const [failure, setFailure] = useState<string | undefined>(undefined)
	const [done, setDone] = useState(false)
	const [, submit] = useMutation(UserUpdatePwdDocument)

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting }
	} = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: '', repeatPassword: '' } })

	const onSubmit = handleSubmit(async (values) => {
		setFailure(undefined)

		const result = await submit(
			{ email, hash, password: values.password, turnstileToken: turnstile.read() },
			CTX_PUBLIC_RESOURCE
		)

		if (result.error !== undefined || result.data === undefined) {
			setFailure(messageOf(result.error))
			return
		}

		setDone(true)
	})

	if (done) {
		return (
			<div className="flex flex-col gap-3">
				<FormStatus tone="ok" message="Your password has been changed." />

				<p className="text-sm text-slate-600">
					<Link to="/login" className="underline">
						Sign in
					</Link>{' '}
					with the new one.
				</p>
			</div>
		)
	}

	return (
		<form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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

			<Turnstile onToken={turnstile.onToken} />

			<FormStatus tone="error" message={failure} />

			{failure !== undefined && (
				<p className="text-sm text-slate-600">
					A reset link stops working 60 minutes after it is sent, and again once it has been used.{' '}
					<Link to="/reset-password" className="underline">
						Ask for a new one
					</Link>
					.
				</p>
			)}

			<SubmitButton busy={isSubmitting} busyLabel="Saving…">
				Set new password
			</SubmitButton>
		</form>
	)
}
