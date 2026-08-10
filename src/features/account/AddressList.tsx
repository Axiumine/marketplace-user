import type { OperationResult } from '@urql/core'
import { useState } from 'react'
import { useMutation } from 'urql'

import { dataOf, messageOf } from '@/api/errors'
import { UserAddressDelDocument, UserDefaultAddressSetDocument } from '@/api/operations/userResource/mutations'
import { FormStatus } from '@/components/ui/FormStatus'

import { type Me, type MeAddress, useMe } from './AccountGate'
import { AddressForm } from './AddressForm'
import { CTX_ACCOUNT_WRITE } from './invalidate'

/**
 * The address book: list, add, edit, delete, and pick the default.
 *
 * ⚠️ **"Is this the default?" is `address._id === me.defaultAddress`, not a flag on the element.** The
 * default is a pointer at the top of the document, which is what makes two defaults *unrepresentable*
 * rather than merely forbidden — see README §4.1. Setting one is a single atomic `$set` with no
 * "clear the others" step, so there is no window in which zero or two addresses are default and no
 * transaction to hold one open.
 *
 * ⚠️ **Deleting the default is allowed and unsets the pointer server-side, in the same update.** That is
 * not politeness: the collection validator carries an `$expr` refusing any document whose
 * `defaultAddress` is not one of its own `addresses[]._id`, so a delete that left the pointer behind is
 * rejected by the database. Nothing here needs to sequence the two writes, and nothing here should try.
 */
const isDefault = (me: Me, address: MeAddress): boolean => me.defaultAddress === address._id

const oneLine = (address: MeAddress): string => `${address.street}, ${address.postalCode} ${address.city} (${address.province})`

const ACTION = 'text-sm underline text-slate-600 hover:text-palette-bg'

export const AddressList = () => {
	const me = useMe()
	const [failure, setFailure] = useState<string | undefined>(undefined)

	/** `'new'` while adding, an address id while editing that one, `null` when the form is closed. */
	const [editing, setEditing] = useState<string | null>(null)

	/** The address awaiting a second click before it is deleted. */
	const [confirming, setConfirming] = useState<string | null>(null)

	const [, del] = useMutation(UserAddressDelDocument)
	const [, setDefault] = useMutation(UserDefaultAddressSetDocument)

	/**
	 * Both single-argument mutations answer the same way, so they share one handler.
	 *
	 * Typed against `OperationResult<unknown>` rather than either mutation's own result: nothing in here
	 * reads a field off `data`, only whether one arrived, and naming a concrete type would mean a second
	 * copy of this function for the second mutation. The variables parameter is left off — its default
	 * already is `AnyVariables`, and spelling it out is the same type written twice.
	 */
	const run = async (action: Promise<OperationResult<unknown>>): Promise<void> => {
		setFailure(undefined)

		const result = await action
		// `dataOf` and not a bare `result.error` test: a `{"data": null}` envelope carries no error at all, and
		// reading that as done leaves the customer looking at a list the server never changed.
		if (dataOf(result) !== undefined) return

		/*
		 * ⚠️ A fallback, because `messageOf` is the empty string when there is no `CombinedError` to quote —
		 * which is exactly the envelope above. Every other surface here reports itself: a form stays open, a
		 * field keeps its error. This one has none of that. The row simply does not change, and an empty
		 * message renders nothing at all, so the customer is left believing the address book says what they
		 * asked it to say.
		 */
		setFailure(messageOf(result.error) || 'That change did not go through. Try again.')
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<p className="text-sm text-slate-600">
					{me.addresses.length === 0 ? 'You have no saved addresses yet.' : 'Your default address is used first when you order.'}
				</p>

				{editing === null && (
					<button
						type="button"
						onClick={() => {
							setEditing('new')
						}}
						className="rounded-box bg-palette-bg px-3 py-2 text-sm text-palette-white"
					>
						Add an address
					</button>
				)}
			</div>

			<FormStatus tone="error" message={failure} />

			{editing === 'new' && (
				<AddressForm
					onDone={() => {
						setEditing(null)
					}}
					onCancel={() => {
						setEditing(null)
					}}
				/>
			)}

			<ul className="flex flex-col gap-3">
				{me.addresses.map((address) => (
					<li key={address._id}>
						{editing === address._id ? (
							<AddressForm
								address={address}
								onDone={() => {
									setEditing(null)
								}}
								onCancel={() => {
									setEditing(null)
								}}
							/>
						) : (
							<div className="rounded-box border border-slate-200 bg-white p-4">
								<div className="flex flex-wrap items-baseline gap-2">
									<span className="font-medium text-palette-bg">{address.label ?? 'Address'}</span>

									{isDefault(me, address) && (
										<span className="rounded-box bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Default</span>
									)}

									{address.position === null && <span className="text-xs text-tip">Not placed on the map</span>}
								</div>

								<p className="mt-1 text-sm text-slate-600">{oneLine(address)}</p>

								<div className="mt-3 flex flex-wrap items-center gap-4">
									{!isDefault(me, address) && (
										<button
											type="button"
											onClick={() => void run(setDefault({ _id: address._id }, CTX_ACCOUNT_WRITE))}
											className={ACTION}
										>
											Make default
										</button>
									)}

									<button
										type="button"
										onClick={() => {
											setEditing(address._id)
										}}
										className={ACTION}
									>
										Edit
									</button>

									{/*
									 * Two clicks rather than `window.confirm`: a native dialog is not stylable, is
									 * blocked outright in some embedded browsers, and cannot be asserted on without
									 * stubbing a global. Making the button state the consequence is also clearer than
									 * a modal that says "Are you sure?" and nothing else.
									 */}
									{confirming === address._id ? (
										<>
											<button
												type="button"
												onClick={() => {
													setConfirming(null)
													void run(del({ _id: address._id }, CTX_ACCOUNT_WRITE))
												}}
												className="text-sm font-medium text-app-error underline"
											>
												Delete for good
											</button>

											<button
												type="button"
												onClick={() => {
													setConfirming(null)
												}}
												className={ACTION}
											>
												Keep it
											</button>
										</>
									) : (
										<button
											type="button"
											onClick={() => {
												setConfirming(address._id)
											}}
											className={ACTION}
										>
											Delete
										</button>
									)}
								</div>
							</div>
						)}
					</li>
				))}
			</ul>
		</div>
	)
}
