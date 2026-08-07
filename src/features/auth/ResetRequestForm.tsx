import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation } from 'urql'
import { z } from 'zod'

import { CTX_PUBLIC_RESOURCE } from '@/api/endpoints'
import { dataOf, messageOf } from '@/api/errors'
import { UserResetPwdDocument } from '@/api/operations/publicResource/mutations'
import { FormStatus } from '@/components/ui/FormStatus'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { TextField } from '@/components/ui/TextField'
import { Turnstile } from '@/components/ui/Turnstile'

import { useTurnstileToken } from './useTurnstileToken'

/**
 * Asks for the password-reset mail.
 *
 * ⚠️ **`UserResetPwdDocument`, never `ResetPwdDocument`.** Both exist on this endpoint, both take an
 * email and both answer `true` for an address they cannot find, so sending the wrong one is
 * indistinguishable from sending the right one for an unregistered address. They differ in the
 * collection they search and, more visibly, in the domain the emailed link is built on: a customer sent
 * the shop-owner link lands on a panel that cannot complete their reset.
 *
 * The confirmation is deliberately vague for the same reason the registration one is: "if that address
 * is registered" is the only phrasing that does not leak whether it is.
 */
const schema = z.object({ email: z.email('Enter a valid email address.') })

type Values = z.infer<typeof schema>

export const ResetRequestForm = () => {
	const turnstile = useTurnstileToken()
	const [failure, setFailure] = useState<string | undefined>(undefined)
	const [sent, setSent] = useState(false)
	const [, submit] = useMutation(UserResetPwdDocument)

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting }
	} = useForm<Values>({ resolver: zodResolver(schema) })

	const onSubmit = handleSubmit(async (values) => {
		setFailure(undefined)

		const result = await submit({ email: values.email, turnstileToken: turnstile.read() }, CTX_PUBLIC_RESOURCE)

		// `dataOf` and not a bare `result.error` test: a `{"data": null}` envelope carries no error at all, and
		// promising a reset email nobody sent leaves someone waiting for it instead of asking again.
		if (dataOf(result) === undefined) {
			setFailure(messageOf(result.error))
			return
		}

		setSent(true)
	})

	if (sent) {
		return (
			<div className="flex flex-col gap-3">
				<FormStatus tone="ok" message="If that address is registered, a reset link is on its way." />

				<p className="text-sm text-slate-600">
					⚠️ The link expires <strong>60 minutes</strong> after it is sent — much sooner than an activation link. An expired one
					fails with the same message as a wrong one, so if in doubt, ask for a new link rather than retrying the old one.
				</p>
			</div>
		)
	}

	return (
		<form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
			<TextField {...register('email')} label="Email" type="email" autoComplete="username" error={errors.email?.message} />

			<Turnstile onToken={turnstile.onToken} />

			<FormStatus tone="error" message={failure} />

			<SubmitButton busy={isSubmitting} busyLabel="Sending…">
				Send reset link
			</SubmitButton>
		</form>
	)
}
