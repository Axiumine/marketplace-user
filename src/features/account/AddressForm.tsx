import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation } from 'urql'
import { z } from 'zod'

import type { MutationResult } from '@/api/errors'
import { dataOf, messageOf } from '@/api/errors'
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
 * of how every mapping UI, every URL and every human says it. Swapping them does not throw: `[42.36,
 * -71.06]` is a perfectly valid point, it is simply in the Southern Ocean, and the `2dsphere` index will happily
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
	// Postal codes are exactly five digits, leading zeros included — which is why this is a string
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
		.regex(/^[A-Z]{2}$/, 'A province is two letters, like MA.'),
	/**
	 * The position, as one `"lon,lat"` string rather than as two fields.
	 *
	 * It is never typed — the geocoder writes it — but it lives in form state alongside fields that are,
	 * and `''` is the only honest "no position". A numeric field would have to spell that as `NaN` or `0`,
	 * and `0, 0` is a real point in the Atlantic that a `2dsphere` query will happily match.
	 *
	 * ⚠️ One field and not two because the halves of a coordinate pair are never independently true. Half a
	 * position is not a degraded position, it is a wrong one — `[-71.0589, NaN]` is rejected on write, and the
	 * same gap filled with a zero puts the customer in the Gulf of Guinea. Holding them together means
	 * "have we got a position" has one answer, in one place, and no way to be asked about half of it.
	 */
	position: z.string()
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

/** `"lon,lat"`, or `''` for an address that has no position — see the schema field of the same name. */
const positionOf = (address: MeAddress | undefined): string => {
	const coordinates = address?.position?.coordinates

	/*
	 * Indexed rather than destructured, and the difference is not style: `const [lon, lat] = coordinates ?? []`
	 * needs a fallback array whose *contents* nothing can observe — the second entry of a one-element array is
	 * `undefined`, exactly as it is for an empty one — so that literal is unkillable by any test. Reading the
	 * two entries through `?.` says the same thing with nothing invented to fall back to.
	 *
	 * `coordinates[0]` is longitude. The latitude alone is the guard: an array is dense, so a second entry
	 * that exists guarantees a first one beside it, and fewer than two entries is not a position at all.
	 */
	const lon = coordinates?.[0]
	const lat = coordinates?.[1]

	return lat === undefined ? '' : `${String(lon)},${String(lat)}`
}

const defaultsFrom = (address: MeAddress | undefined): Values => ({
	label: blank(address?.label),
	street: blank(address?.street),
	postalCode: blank(address?.postalCode),
	city: blank(address?.city),
	province: blank(address?.province),
	position: positionOf(address)
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

	const position = watch('position')
	const located = position !== ''

	const onSubmit = handleSubmit(async (values) => {
		setFailure(undefined)

		// ⚠️ longitude first, on both sides of the split. See the note at the top of this file.
		const [lon, lat] = values.position.split(',')

		const input = {
			label: values.label === '' ? undefined : values.label,
			street: values.street,
			postalCode: values.postalCode,
			city: values.city,
			province: values.province,
			position: located ? { coordinates: [Number(lon), Number(lat)] } : undefined
		}

		// Annotated rather than inferred — see `MutationResult`. The two mutations answer different payloads
		// and this form reads neither: all it needs to know is whether one arrived.
		const result: MutationResult<unknown> =
			address === undefined
				? await add({ address: input }, CTX_ACCOUNT_WRITE)
				: await update({ _id: address._id, address: input }, CTX_ACCOUNT_WRITE)

		// `dataOf` and not a bare `result.error` test: a `{"data": null}` envelope carries no error at all, and
		// closing the form on one throws away an address the customer typed and the server never stored.
		if (dataOf(result) === undefined) setFailure(messageOf(result.error))
		else onDone()
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
					// ⚠️ longitude first, as everywhere else in this file.
					setValue('position', `${found.lon.toString()},${found.lat.toString()}`, options)
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
			 * Registered so react-hook-form keeps the position in form state, and hidden because there is
			 * nothing in `"-71.0589,42.3601"` for a customer to read or correct. A hidden input is not feedback,
			 * though: the sentence below is, and it is the only place anyone learns that a hand-typed address
			 * will not be sorted by distance.
			 */}
			<input type="hidden" {...register('position')} />

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
