import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation } from 'urql'
import { z } from 'zod'

import { messageOf } from '@/api/errors'
import { UserAddressAddDocument, UserAddressUpdateDocument } from '@/api/operations/userResource/mutations'
import { AddressAutocomplete } from '@/components/ui/AddressAutocomplete'
import { FormStatus } from '@/components/ui/FormStatus'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { TextField } from '@/components/ui/TextField'

import type { MeAddress } from './AccountGate'
import { CTX_ACCOUNT_WRITE } from './invalidate'

/**
 * Adds an address, or edits one. One component for both, because the two differ in exactly two things —
 * which mutation is called and whether an `_id` goes with it — and a second copy would be the same
 * eighty lines with a different verb.
 *
 * ⚠️ **Coordinates are `[longitude, latitude]`, in that order.** This is GeoJSON, and it is the reverse
 * of how every mapping UI, every URL and every human says it. Swapping them does not throw: `[45.46,
 * 9.19]` is a perfectly valid point, it is simply in Somalia, and the `2dsphere` index will happily
 * answer "no shops near you" forever. Nominatim answers `lat`/`lon` as named fields, which is why the
 * conversion happens here, once, at the boundary.
 *
 * The position is optional and stays optional. A customer who types their address by hand because the
 * geocoder does not know it still gets a saved address — one that cannot be used for distance sorting,
 * which is a smaller loss than refusing to store where they live.
 */
const LABEL_MAX = 50

const schema = z.object({
	label: z
		.string()
		.trim()
		.max(LABEL_MAX, `Use at most ${String(LABEL_MAX)} characters.`),
	street: z.string().trim().min(1, 'Street is required.').max(250, 'Use at most 250 characters.'),
	// Italian postal codes are exactly five digits, leading zeros included — which is why this is a string
	// and not a number. `00187` parsed as a number is 187, and there is no way back.
	postalCode: z
		.string()
		.trim()
		.regex(/^\d{5}$/, 'A postal code is five digits.'),
	city: z.string().trim().min(1, 'City is required.').max(100, 'Use at most 100 characters.'),
	province: z
		.string()
		.trim()
		.toUpperCase()
		.regex(/^[A-Z]{2}$/, 'A province is two letters, like MI.'),
	/**
	 * Kept as strings, not numbers.
	 *
	 * They are never typed — the geocoder writes them — but they live in form state alongside fields that
	 * are, and `''` is the only honest "no position". A numeric field would have to use `NaN` or `0` for
	 * that, and `0, 0` is a real point in the Atlantic that a `2dsphere` query will match.
	 */
	lat: z.string(),
	lon: z.string()
})

type Values = z.infer<typeof schema>

export interface AddressFormProps {
	/** Absent when adding. */
	readonly address?: MeAddress
	/** Called after a successful write, so the list can close the form. */
	readonly onDone: () => void
	readonly onCancel: () => void
}

const blank = (value: string | null | undefined): string => value ?? ''

const defaultsFrom = (address: MeAddress | undefined): Values => ({
	label: blank(address?.label),
	street: blank(address?.street),
	postalCode: blank(address?.postalCode),
	city: blank(address?.city),
	province: blank(address?.province),
	// `coordinates[0]` is longitude. Indexed access can be `undefined` under
	// `noUncheckedIndexedAccess`, and a position with fewer than two entries is not a position.
	lon: address?.position?.coordinates[0]?.toString() ?? '',
	lat: address?.position?.coordinates[1]?.toString() ?? ''
})

export const AddressForm = ({ address, onDone, onCancel }: AddressFormProps) => {
	const [failure, setFailure] = useState<string | undefined>(undefined)
	const [, add] = useMutation(UserAddressAddDocument)
	const [, update] = useMutation(UserAddressUpdateDocument)

	const {
		register,
		handleSubmit,
		setValue,
		watch,
		formState: { errors, isSubmitting }
	} = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaultsFrom(address) })

	const lat = watch('lat')
	const lon = watch('lon')
	const located = lat !== '' && lon !== ''

	const onSubmit = handleSubmit(async (values) => {
		setFailure(undefined)

		const input = {
			label: values.label === '' ? undefined : values.label,
			street: values.street,
			postalCode: values.postalCode,
			city: values.city,
			province: values.province,
			// ⚠️ longitude first. See the note at the top of this file.
			position: located ? { coordinates: [Number(values.lon), Number(values.lat)] } : undefined
		}

		const result =
			address === undefined
				? await add({ address: input }, CTX_ACCOUNT_WRITE)
				: await update({ _id: address._id, address: input }, CTX_ACCOUNT_WRITE)

		if (result.error !== undefined || result.data === undefined) {
			setFailure(messageOf(result.error))
			return
		}

		onDone()
	})

	return (
		<form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 rounded-box border border-slate-200 bg-white p-4">
			<AddressAutocomplete
				label="Find your address"
				hint="Pick a suggestion to fill the fields below, or type them in yourself."
				onPick={(found) => {
					// `shouldValidate` so a field the geocoder just corrected drops its old error rather than
					// keeping it until the next blur.
					const options = { shouldValidate: true, shouldDirty: true } as const

					setValue('street', found.street, options)
					setValue('postalCode', found.postalCode, options)
					setValue('city', found.city, options)
					setValue('province', found.province, options)
					setValue('lat', found.lat.toString(), options)
					setValue('lon', found.lon.toString(), options)
				}}
			/>

			<TextField
				{...register('label')}
				label="Name this address"
				autoComplete="off"
				hint="Home, work, anything that helps you tell them apart. Optional."
				error={errors.label?.message}
			/>

			<TextField
				{...register('street')}
				label="Street and number"
				autoComplete="street-address"
				error={errors.street?.message}
			/>

			<div className="grid gap-4 sm:grid-cols-3">
				<TextField
					{...register('postalCode')}
					label="Postal code"
					inputMode="numeric"
					autoComplete="postal-code"
					error={errors.postalCode?.message}
				/>

				<TextField {...register('city')} label="City" autoComplete="address-level2" error={errors.city?.message} />

				<TextField
					{...register('province')}
					label="Province"
					maxLength={2}
					autoComplete="address-level1"
					error={errors.province?.message}
				/>
			</div>

			{/*
			 * Not `<input type="hidden">`: react-hook-form needs these registered to keep them in form state,
			 * and a hidden input would still be in the DOM with no way for anyone to see whether the address
			 * was located. The sentence below is that feedback, and it is the only place a customer learns
			 * that a hand-typed address will not be sorted by distance.
			 */}
			<input type="hidden" {...register('lat')} />
			<input type="hidden" {...register('lon')} />

			<p className="text-xs text-tip">
				{located
					? 'This address is placed on the map, so we can sort shops by how close they are to it.'
					: 'This address has no map position yet. It will still be saved — pick a suggestion above to place it.'}
			</p>

			<FormStatus tone="error" message={failure} />

			<div className="flex gap-2">
				<SubmitButton busy={isSubmitting} busyLabel="Saving…">
					{address === undefined ? 'Add address' : 'Save changes'}
				</SubmitButton>

				<button type="button" onClick={onCancel} className="rounded-box px-4 py-2 text-sm text-slate-600 underline">
					Cancel
				</button>
			</div>
		</form>
	)
}
