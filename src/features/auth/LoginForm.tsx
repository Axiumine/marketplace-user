import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation } from 'urql'
import { z } from 'zod'

import { CTX_PUBLIC_AUTHORIZATION } from '@/api/endpoints'
import { dataOf, messageOf } from '@/api/errors'
import { LoginUserDocument } from '@/api/operations/publicAuthorization/loginUser'
import { setAccessToken } from '@/api/tokenStore'
import { setSession } from '@/auth/session'
import { FormStatus } from '@/components/ui/FormStatus'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { TextField } from '@/components/ui/TextField'
import { Turnstile } from '@/components/ui/Turnstile'

import { useTurnstileToken } from './useTurnstileToken'

/**
 * Signs a customer in.
 *
 * ⚠️ **The password is not length-validated here, and that is not an oversight.** A login form that
 * rejects a nine-character password before sending it tells an attacker that no account uses one — and
 * it locks out anyone whose password predates a rule change. The rules belong on registration; a login
 * form's job is to pass through whatever was typed and let the server say yes or no.
 *
 * The server's "no" is a single generic message for every cause — unknown address, wrong password,
 * unverified email, disabled account. That is what stops the form being an account-enumeration oracle,
 * so the copy here must not try to be more helpful than the answer it received. The one concession is
 * the resend link below, which is offered unconditionally rather than only after a verification
 * failure: it is useless to anyone who is not waiting on an activation mail, and it reveals nothing.
 */
const schema = z.object({
	email: z.email('Enter a valid email address.'),
	password: z.string().min(1, 'Enter your password.'),
	rememberMe: z.boolean()
})

type Values = z.infer<typeof schema>

export const LoginForm = () => {
	const navigate = useNavigate()
	const turnstile = useTurnstileToken()
	const [failure, setFailure] = useState<string | undefined>(undefined)
	const [, login] = useMutation(LoginUserDocument)

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting }
	} = useForm<Values>({ resolver: zodResolver(schema) })

	const onSubmit = handleSubmit(async (values) => {
		setFailure(undefined)

		const result = await login({ ...values, turnstileToken: turnstile.read() }, CTX_PUBLIC_AUTHORIZATION)

		// `dataOf` and not a bare `result.error` test: a `{"data": null}` envelope carries no error at all,
		// and signing someone in on one would set an empty session and bounce them off the account page.
		const data = dataOf(result)

		if (data === undefined) {
			setFailure(messageOf(result.error))
			return
		}

		// Order matters: the token has to be readable before anything navigates, or the first private
		// query fires without an `Authorization` header and bounces straight back to this page.
		setAccessToken(data.loginUser.accessToken)
		setSession(values.email)

		await navigate({ to: '/account' })
	})

	return (
		<form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
			<TextField {...register('email')} label="Email" type="email" autoComplete="username" error={errors.email?.message} />

			<TextField
				{...register('password')}
				label="Password"
				type="password"
				autoComplete="current-password"
				error={errors.password?.message}
			/>

			<label className="flex items-center gap-2 text-sm text-slate-700">
				<input {...register('rememberMe')} type="checkbox" className="size-4" />
				Keep me signed in
			</label>

			<Turnstile onToken={turnstile.onToken} />

			<FormStatus tone="error" message={failure} />

			<SubmitButton busy={isSubmitting} busyLabel="Signing in…">
				Sign in
			</SubmitButton>

			<p className="text-sm">
				<Link to="/reset-password" className="underline">
					Forgot your password?
				</Link>
			</p>
		</form>
	)
}
