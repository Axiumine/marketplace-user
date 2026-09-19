import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation } from 'urql'

import { CTX_USER_RESOURCE } from '@/api/endpoints'
import { dataOf, messageOf } from '@/api/errors'
import { UserDelDocument } from '@/api/operations/userResource/mutations'
import { useLogout } from '@/auth/useLogout'
import { FormStatus } from '@/components/ui/FormStatus'

/** What the box has to be ticked for. Exported so the test asserts the copy rather than a paraphrase. */
export const CONFIRM_LABEL = 'I understand every session of mine ends and I cannot sign in with this account again'

/** The refusal, when the server answers `false` with no error of its own to quote. */
export const CLOSE_REFUSED = 'The account was not closed.'

/**
 * Closing your own account — the customer half of what `marketplace-shopowner`'s `CloseAccount` does for
 * a shop owner, over `userDel` instead of `shopOwnerDel`.
 *
 * ⚠️ **The mutation takes no arguments, and that absence is the security property** — the account it
 * closes is the one the Redis session behind the access token names. An `_id` here would ask the backend
 * to accept from a browser the one thing the session already proves, which is the rule the header of
 * `operations/userResource/mutations.ts` states for every write on this tier.
 *
 * The two-step is a tick and then a press, not a typed word. What this button does is undoable for thirty
 * days (ADR-046), so the gate is proportionate to a decision that can be taken back rather than to a
 * shredder — but it is a real gate, because the half of it that cannot be taken back is immediate: every
 * session ends the moment it lands, here and everywhere else.
 *
 * ⚠️ **Not a `<form>` and no `SubmitButton`, unlike every other control in the private area.** There is
 * nothing to type and nothing to validate, so a submit handler would exist only to be prevented — and a
 * checkbox that submits on Enter is the one interaction this screen must not have. `FormStatus` still
 * carries the refusal, because it is the app's one place a write reports how it went and a second idiom
 * for the same job is how one of them stops being announced.
 *
 * ⚠️ **`CTX_USER_RESOURCE`, not `CTX_ACCOUNT_WRITE`.** The invalidation that context exists for would
 * make `AccountGate` re-read an account that no longer answers, racing the sign-out below for a 401
 * nobody reads. What follows the `true` is a logout, not a refetch.
 *
 * On success the customer is signed out through `useLogout`, the same path the account navigation uses.
 * The `logout` mutation it sends will very likely fail — the backend has just ended every session this
 * account had — and that is why it is the right call rather than a lucky one: `useLogout` swallows the
 * result and clears the token, the session and the route either way, so the local teardown is identical
 * whether the server had anything left to delete or not.
 */
export const CloseAccount = () => {
	const [confirmed, setConfirmed] = useState(false)
	const [refused, setRefused] = useState<string | undefined>(undefined)
	const [del, runDel] = useMutation(UserDelDocument)
	const logout = useLogout()

	const close = async () => {
		const outcome = await runDel({}, CTX_USER_RESOURCE)

		/*
		 * `dataOf` first and the value second: a `{"data": null}` envelope carries no error to quote, and
		 * signing somebody out on the strength of it would leave them looking at the public home page with
		 * an account that is still open and no way to know it.
		 */
		if (dataOf(outcome)?.userDel !== true) {
			setRefused(outcome.error === undefined ? CLOSE_REFUSED : messageOf(outcome.error))
			return
		}

		await logout()
	}

	return (
		<div className="flex max-w-xl flex-col gap-4 text-sm text-slate-600">
			<p>
				Closing your account ends <strong>every session you have open</strong> — here and in any other browser — and you cannot
				sign in with it again from that moment.
			</p>

			<p>
				You have <strong>thirty days</strong> to change your mind. Register again at this same email address inside that window
				and confirm the message we send you: the account comes back as it was, with the same details and the same addresses.
			</p>

			{/*
			 * Said here because it is the one consequence a customer may believe they are buying: closing and
			 * re-registering is not a way out of a suspension. ADR-044 gives the admin tier the only hand
			 * that lifts one, and ADR-046 leaves `disabled`, `disabledBy` and `disabledReason` untouched
			 * through the whole restore, precisely so this route cannot be used as one.
			 */}
			<p>
				A suspension is not lifted by closing your account. If an admin has suspended you, the suspension comes back with the
				account, and only an admin can take it off.
			</p>

			{/*
			 * ⚠️ The last paragraph is ADR-041 said to the person it is about, and it is the same sentence
			 * `/privacy` makes publicly: the document is never removed, the personal fields are overwritten at
			 * day 30. Promising a deletion here would be a promise the sweeper cannot keep, and the two pages
			 * would then disagree about what closing an account does.
			 */}
			<p>
				After thirty days your personal details are overwritten and the account cannot be brought back at all. The record that an
				account existed and when it closed is kept; nothing here is a way to have your data kept — it is the opposite. What we do
				with it either way is on our{' '}
				<Link to="/privacy" className="underline">
					privacy page
				</Link>
				.
			</p>

			<label className="flex items-start gap-2">
				<input
					type="checkbox"
					checked={confirmed}
					onChange={() => {
						setConfirmed((current) => !current)
					}}
					className="mt-0.5"
				/>
				<span>{CONFIRM_LABEL}</span>
			</label>

			{/* The live region has to be in the DOM before its content changes, or the change is never
			    announced — see `FormStatus`. This wrapper never unmounts; only its content varies.

			    ⚠️ `refused` goes in unconditionally, as it does at every other call site. `FormStatus`
			    already returns null for an absent or empty message, so a `refused === undefined ? null :`
			    guard here renders the identical DOM either way — a branch no test can tell apart, which is
			    a mutant no test can kill. */}
			<div>
				<FormStatus tone="error" message={refused} />
			</div>

			<div>
				<button
					type="button"
					disabled={!confirmed || del.fetching}
					aria-busy={del.fetching}
					onClick={() => {
						void close()
					}}
					className="rounded-box bg-app-error px-4 py-2 text-sm font-medium text-palette-white disabled:opacity-60"
				>
					{del.fetching ? 'Closing…' : 'Close my account'}
				</button>
			</div>
		</div>
	)
}
