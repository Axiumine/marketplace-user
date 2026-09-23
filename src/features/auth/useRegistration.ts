import { zodResolver } from '@hookform/resolvers/zod'
import type { TypedDocumentNode } from '@urql/core'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation } from 'urql'
import { z } from 'zod'

import { CTX_PUBLIC_RESOURCE } from '@/api/endpoints'
import { dataOf, messageOf } from '@/api/errors'

import { matchingPasswords, passwordSchema } from './password'
import { useTurnstileToken } from './useTurnstileToken'

/**
 * What both registration forms ask for: an address, a password, and the password again.
 *
 * The customer's form and the seller's collect the same three fields because they open the same kind of
 * account — the difference between them is which collection the mutation writes and what the screens say
 * about what happens next, never what is typed.
 */
const schema = z
	.object({
		email: z.email('Enter a valid email address.'),
		password: passwordSchema,
		repeatPassword: z.string()
	})
	.superRefine(matchingPasswords)

type Values = z.infer<typeof schema>

/** The three fields plus the token the edge challenge produces, which no field holds. */
type Variables = Values & { turnstileToken?: string | null | undefined }

/**
 * The machinery behind `/register` and `/register/seller`, which is the same machinery twice.
 *
 * ⚠️ **The document is a parameter, and it is the whole difference between the two accounts.**
 * `userRegister` writes `user`, `shopOwnerRegister` writes `shopOwner` with `waitApprov: true`, both
 * answer `true` for an address they will not act on, and nothing else in the call distinguishes them — a
 * form handed the wrong one reports success while creating the wrong kind of account. The forms name it
 * at the call site and their tests assert the operation that went over the wire.
 *
 * Extracted rather than repeated: the two components held a byte-identical copy of this, so a fix to the
 * `dataOf` handling below had to be made twice and would silently be made once.
 */
export const useRegistration = <Data>(document: TypedDocumentNode<Data, Variables>) => {
	const turnstile = useTurnstileToken()
	const [failure, setFailure] = useState<string | undefined>(undefined)
	const [sentTo, setSentTo] = useState<string | undefined>(undefined)
	const [, submit] = useMutation(document)

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
			// The server verifies Turnstile before anything else, so a refusal for any other reason has
			// already spent the token — without this, every retry is rejected as a Cloudflare duplicate no
			// matter how the form was fixed.
			turnstile.reset()
			return
		}

		setSentTo(values.email)
	})

	return { errors, failure, isSubmitting, onSubmit, register, sentTo, turnstile }
}
