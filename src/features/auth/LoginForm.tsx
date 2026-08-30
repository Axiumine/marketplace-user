import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
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
 *
 * ⚠️ **A successful sign-in leaves the page — `window.location.assign`, never the router**
 * ([`ADR-051`](../../../../docs/devprotocol/phase3/adr/ADR-051-a-session-exit-is-a-page-load.md)). This is
 * the entrance half of the rule the sign-out button obeys, and it is needed here because this app links to
 * `/login` from the header and the footer: a customer who is already signed in can reach this form without
 * a page load. The urql client is a module singleton and its document cache keys a result by the query and
 * its variables and by nothing that names a session, so `Me` — which takes no variables — would answer the
 * second customer with the first one's account. A document load rebuilds the client, the token store and
 * the session store together, which is what makes that impossible rather than merely unlikely.
 */
const schema = z.object({
	email: z.email('Enter a valid email address.'),
	password: z.string().min(1, 'Enter your password.'),
	rememberMe: z.boolean()
})

type Values = z.infer<typeof schema>

export const LoginForm = () => {
	const turnstile = useTurnstileToken()
	const [failure, setFailure] = useState<string | undefined>(undefined)
	// Set once and never cleared: the only thing that ends it is the document the `assign` below is
	// fetching. Without it `isSubmitting` drops back to false the moment this handler returns and the
	// button goes live again for the length of the load, where a second click buys a second `LoginUser`.
	const [leaving, setLeaving] = useState(false)
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

		// ⚠️ Both stores are module state, so the load below rebuilds them empty and neither value reaches
		// the account page. They are written anyway, for the interval between here and the unload: the
		// header reads `signedIn`, and leaving it false would show "Sign in" over a form that has just
		// succeeded. `/account` re-mints the token from the httpOnly refresh cookie, which is the path a
		// reload of the private area has always taken.
		setAccessToken(data.loginUser.accessToken)
		setSession(values.email)

		setLeaving(true)
		window.location.assign('/account')
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

			<SubmitButton busy={isSubmitting || leaving} busyLabel="Signing in…">
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
