import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation } from 'urql'
import { z } from 'zod'

import { messageOf } from '@/api/errors'
import { UserPersonalDataUpdateDocument } from '@/api/operations/userResource/mutations'
import { FormStatus } from '@/components/ui/FormStatus'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { TextField } from '@/components/ui/TextField'

import { useMe } from './AccountGate'
import { CTX_ACCOUNT_WRITE } from './invalidate'

/**
 * Name, date of birth and contact numbers.
 *
 * ⚠️ **`personalData` is null on a fresh account, and this form is what creates it.** Registration takes
 * an email and a password and nothing else, so "no personal data yet" is an ordinary state a real
 * account sits in — not a loading state and not an error. The form therefore opens empty rather than
 * refusing to render, and the mutation is an upsert on the server side.
 *
 * ⚠️ **`contacts.email` is not the login address.** The login address is `me.email` and is changed
 * nowhere in this app; this one is "where to reach me about an order", which for a customer is often a
 * different mailbox. Labelling it plainly is the whole defence against somebody typing a new address
 * here and expecting to sign in with it.
 *
 * Empty optional fields are dropped rather than sent as `''`. The three contact fields and `birth` are
 * nullable server-side, and an empty string is a *value* — it would be stored, and it would come back as
 * an empty contact rather than as no contact. `undefined` omits the key from the JSON entirely.
 */
const NAME_MAX = 50
const PHONE_MAX = 20

/**
 * `.trim()` runs before the length check, so a field of spaces fails `min(1)`.
 *
 * The trimmed value is what the resolver receives too — zod transforms the parsed output, and
 * react-hook-form hands the resolver's output to the submit handler, not the raw input.
 */
const required = (label: string) =>
	z
		.string()
		.trim()
		.min(1, `${label} is required.`)
		.max(NAME_MAX, `${label} must be at most ${String(NAME_MAX)} characters.`)

const optionalPhone = z
	.string()
	.trim()
	.max(PHONE_MAX, `Use at most ${String(PHONE_MAX)} characters.`)

const schema = z.object({
	firstName: required('First name'),
	lastName: required('Last name'),
	// A plain string, not `z.iso.date()`: `<input type="date">` already refuses to emit anything but
	// `YYYY-MM-DD` or the empty string, and layering a format error on top of a control that cannot
	// produce a bad format only fires on browsers where the picker fell back to a text box.
	birthDate: z.string(),
	mobile: optionalPhone,
	landline: optionalPhone,
	contactEmail: z.union([z.literal(''), z.email('Enter a valid email address.')])
})

type Values = z.infer<typeof schema>

/** `''` for anything absent — a controlled input handed `undefined` becomes uncontrolled and warns. */
const blank = (value: string | null | undefined): string => value ?? ''

/** An ISO-8601 timestamp back to the `YYYY-MM-DD` an `<input type="date">` accepts. */
const dateInputValue = (value: string | null | undefined): string => blank(value).slice(0, 10)

/** `''` → omitted. See the note above: an empty string is a stored value, absence is not. */
const orUndefined = (value: string): string | undefined => (value === '' ? undefined : value)

export const PersonalDataForm = () => {
	const me = useMe()
	const [status, setStatus] = useState<{ readonly tone: 'ok' | 'error'; readonly message: string } | undefined>(undefined)
	const [, submit] = useMutation(UserPersonalDataUpdateDocument)

	const {
		register,
		handleSubmit,
		formState: { errors, isSubmitting }
	} = useForm<Values>({
		resolver: zodResolver(schema),
		defaultValues: {
			firstName: blank(me.personalData?.firstName),
			lastName: blank(me.personalData?.lastName),
			birthDate: dateInputValue(me.personalData?.birth?.date),
			mobile: blank(me.personalData?.contacts?.mobile),
			landline: blank(me.personalData?.contacts?.landline),
			contactEmail: blank(me.personalData?.contacts?.email)
		}
	})

	const onSubmit = handleSubmit(async (values) => {
		setStatus(undefined)

		const mobile = orUndefined(values.mobile)
		const landline = orUndefined(values.landline)
		const email = orUndefined(values.contactEmail)
		const empty = mobile === undefined && landline === undefined && email === undefined

		const result = await submit(
			{
				personalData: {
					firstName: values.firstName,
					lastName: values.lastName,
					birth: values.birthDate === '' ? undefined : { date: values.birthDate },
					// All three blank means no contacts at all, not a contacts object with three holes in
					// it — the difference is whether the stored document grows an empty subdocument.
					contacts: empty ? undefined : { mobile, landline, email }
				}
			},
			CTX_ACCOUNT_WRITE
		)

		setStatus(
			result.error === undefined && result.data !== undefined
				? { tone: 'ok', message: 'Your details have been saved.' }
				: { tone: 'error', message: messageOf(result.error) }
		)
	})

	return (
		<form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
			<p className="text-sm text-slate-600">
				You sign in with <strong>{me.email}</strong>. That address is not changed here.
			</p>

			<div className="grid gap-4 sm:grid-cols-2">
				<TextField {...register('firstName')} label="First name" autoComplete="given-name" error={errors.firstName?.message} />

				<TextField {...register('lastName')} label="Last name" autoComplete="family-name" error={errors.lastName?.message} />
			</div>

			<TextField
				{...register('birthDate')}
				label="Date of birth"
				type="date"
				autoComplete="bday"
				error={errors.birthDate?.message}
			/>

			<div className="grid gap-4 sm:grid-cols-2">
				<TextField {...register('mobile')} label="Mobile" type="tel" autoComplete="tel" error={errors.mobile?.message} />

				<TextField
					{...register('landline')}
					label="Landline"
					type="tel"
					autoComplete="tel-national"
					error={errors.landline?.message}
				/>
			</div>

			<TextField
				{...register('contactEmail')}
				label="Contact email"
				type="email"
				// `email` and not `username`: `username` is what the login field carries, and offering the
				// password manager a second "username" on this page is how it ends up saving the wrong one.
				autoComplete="email"
				hint="Where we write about your orders. Leave it empty to use your sign-in address."
				error={errors.contactEmail?.message}
			/>

			<FormStatus tone={status?.tone ?? 'error'} message={status?.message} />

			<div>
				<SubmitButton busy={isSubmitting} busyLabel="Saving…">
					Save details
				</SubmitButton>
			</div>
		</form>
	)
}
