import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
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
import { PositionPickerIsland } from '@/features/map/PositionPickerIsland'

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
 *
 * **Three ways in and one way out.** A picked suggestion writes the position, a pin dropped on the map
 * writes it, and "Remove position" takes it away again; all three write the same single form field, and
 * the map reads that field back rather than keeping a point of its own. The map is what makes an address
 * the geocoder has never heard of — a new building, a rural road — placeable at all, and the geocoder is
 * what makes a position reachable without a pointer, since a canvas cannot be dragged with a keyboard.
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

/**
 * Six decimals, with the trailing zeros dropped.
 *
 * A pin dropped on the map answers a full double — `-71.05893123412345` — and every digit past the sixth
 * is smaller than a tenth of a metre: finer than the map can be clicked, finer than the basemap is drawn
 * and finer than any address is meant. `String(Number(...))` is what keeps the rounding from showing:
 * `"-71.058900"` becomes `"-71.0589"` again, so a geocoded position keeps the spelling it arrived with
 * instead of growing zeros the customer never chose.
 */
const DECIMALS = 6

const rounded = (value: number): string => String(Number(value.toFixed(DECIMALS)))

/** The field's spelling of a point. ⚠️ Longitude first — see the note at the top of this file. */
const textOf = (point: readonly [number, number]): string => `${rounded(point[0])},${rounded(point[1])}`

/**
 * The other direction: the field back to a pair, or `undefined` when the address has no position.
 *
 * The latitude alone is the guard, for the reason `positionOf` gives below: `''.split(',')` is `['']`, so
 * a missing second entry is exactly "there is no position here" and nothing has to be invented to fall
 * back to.
 */
const pointOf = (value: string): readonly [number, number] | undefined => {
	// ⚠️ longitude first, on both sides of the split.
	const [lon, lat] = value.split(',')

	return lat === undefined ? undefined : [Number(lon), Number(lat)]
}

/** `shouldValidate` so a field just corrected drops its old error rather than keeping it until the next blur. */
const WRITTEN = { shouldValidate: true, shouldDirty: true } as const

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

	/*
	 * Memoised because the map takes a pair and frames itself on a point it has not seen before: parsing on
	 * every render would hand it a new array each time, and a new array is a new point as far as any
	 * dependency list can tell. One string in form state, one pair derived from it.
	 */
	const point = useMemo(() => pointOf(position), [position])
	const located = point !== undefined

	const onSubmit = handleSubmit(async (values) => {
		setFailure(undefined)

		const at = pointOf(values.position)

		const input = {
			label: values.label === '' ? undefined : values.label,
			street: values.street,
			postalCode: values.postalCode,
			city: values.city,
			province: values.province,
			position: at === undefined ? undefined : { coordinates: [at[0], at[1]] }
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
					setValue('street', found.street, WRITTEN)
					setValue('postalCode', found.postalCode, WRITTEN)
					setValue('city', found.city, WRITTEN)
					setValue('province', found.province, WRITTEN)
					// ⚠️ longitude first, as everywhere else in this file. The map frames itself on this.
					setValue('position', textOf([found.lon, found.lat]), WRITTEN)
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
			 * nothing in `"-71.0589,42.3601"` for a customer to read or correct. The map below is what shows it,
			 * and the sentence beside it is what says an address is saved with or without one.
			 */}
			<input type="hidden" {...register('position')} />

			<PositionPickerIsland
				position={point}
				onPick={(picked) => {
					setValue('position', textOf(picked), WRITTEN)
				}}
			/>

			<div className="flex flex-wrap items-center justify-between gap-2">
				<p className="text-xs text-tip">
					{located
						? 'This address is placed on the map, so we can sort shops by how close they are to it. Drag the pin, or click the map, to correct it.'
						: 'This address has no map position yet. It will still be saved — pick a suggestion above, or click the map, to place it.'}
				</p>

				{/*
				 * Offered only when there is something to remove, and it clears the field rather than moving the
				 * pin anywhere: a position nobody can vouch for is worse than none, because distance sorting
				 * believes it.
				 */}
				{located && (
					<button
						type="button"
						onClick={() => {
							setValue('position', '', WRITTEN)
						}}
						className="text-xs text-slate-600 underline"
					>
						Remove position
					</button>
				)}
			</div>

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
