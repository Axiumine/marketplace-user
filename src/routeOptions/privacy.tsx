import { headFor } from '@/lib/seo'

/**
 * `/privacy` — the platform's privacy notice, and deliberately the smallest one that is true.
 *
 * ⚠️ **This page is the public half of three things the platform does, not a compliance document.**
 *
 * The edge keeps two log files that record something about a visitor, and the platform owner's answer of
 * 2026-08-11 was that their *lifetime* is the control rather than their content — 14 days, shredded on
 * removal. The account database keeps a closed account for thirty days and then overwrites it in place
 * (ADR-041 in the parent workspace), and inside those thirty days a confirmed registration at the same
 * address hands the account back (ADR-046). And an admin reaches into a customer account from one table
 * and two mutations on `marketplace-dev-admin-authenticated-resource` — read, suspend, close — which is
 * stated here on the platform owner's ruling of 2026-08-30: a screen listing every account's email address
 * is a disclosure whether or not anybody writes it down.
 *
 * All three have code behind them — `marketplace-nginx/logrotate.d/nginx`, `retentionSweep.mts`,
 * `confirmRegistration.mts`, `usersActiveTbl` with `userUpdateStatus` and `userDel` — and this page states
 * what they do. A page promising a period the configuration does not keep is a false statement, so they are
 * edited together or not at all: the code is the source of truth and this text follows it, never the other
 * way round.
 *
 * ⚠️ **Nothing here describes a process nobody operates.** No lawful basis, no controller identity, no
 * access or erasure flow, no retention period for anything the four sections below do not name: none of
 * those has a decision behind it yet (`RISK_REGISTER` R25, `phase1/NFR.md` open question 1), and a notice
 * that describes an imaginary procedure is worse than a short one that describes a real one. Add a
 * paragraph here when a decision exists, not when a template suggests one.
 *
 * ⚠️ **The undo is stated because it is a weakening.** ADR-046 turned *"your data is gone when you close"*
 * into *"your data is gone thirty days after you close, and anybody who can read mail at your address can
 * have it back until then"*, which is a materially weaker promise than the one closure used to make. A
 * notice that quietly kept the old sentence would be describing a platform this one is not.
 *
 * It is a **public, indexable** page on purpose: `noIndex` is not set and `robots.txt` does not disallow
 * it. A statement a data subject cannot find is not a statement, and the two panel apps are behind a
 * login — which is why this lives in the one app an anonymous visitor can reach.
 */
const head = () =>
	headFor({
		title: 'Privacy',
		description: 'What this site records about a visit and about an account, and for how long.',
		path: '/privacy'
	})

const Privacy = () => (
	<div className="mx-auto max-w-3xl px-4 py-8">
		<h1 className="text-3xl font-semibold text-palette-bg">Privacy</h1>
		<p className="mt-2 text-slate-600">
			What the web server records about a visit to this site and for how long, who at this platform can see an account and what
			they can do to it, and what happens to an account when it is closed. This page covers those three things and nothing else;
			anything more will be added here when it has been decided, rather than described in advance.
		</p>

		<h2 className="mt-8 text-xl font-semibold text-palette-bg">The two log files</h2>
		<ul className="mt-2 flex list-disc flex-col gap-2 pl-5 text-slate-600">
			<li>
				The web server&rsquo;s <strong>error log</strong> records the network address a request came from, alongside the error
				itself. It is kept for 14 days.
			</li>
			<li>
				Its <strong>access log</strong> records the URL that was requested, when, and how the server answered. It records no
				network address. It is kept for the same 14 days.
			</li>
		</ul>

		{/*
		 * The boundary is stated rather than rounded away. `daily` + `rotate 14` means the file being written
		 * is closed once a day and fourteen closed ones are kept, so a line written just after a rotation is
		 * destroyed on the fifteenth day and not the fourteenth. "14 days" on its own would be a period this
		 * configuration slightly overruns, which is the kind of small inaccuracy a notice cannot afford.
		 */}
		<p className="mt-4 text-slate-600">
			Both files are closed once a day and fourteen closed ones are kept, so no entry survives past the fifteenth day. When one
			falls out of that window it is <strong>shredded</strong> — its contents are overwritten before the file is removed — rather
			than only deleted.
		</p>

		<h2 className="mt-8 text-xl font-semibold text-palette-bg">A registration you have not confirmed</h2>

		{/*
		 * ADR-042. Until the link is clicked there is no account at all — the submission is one Redis key with
		 * `PENDING_TTL_SECONDS = 3 * 24 * 60 * 60` on it, and expiry *is* abandonment. Worth its own paragraph
		 * because it is the one case where doing nothing is the complete answer: no account was created, so
		 * there is nothing to close and nothing to ask about.
		 */}
		<p className="mt-2 text-slate-600">
			Filling in the registration form does not create an account. What it creates is a temporary record holding what you typed,
			and that record <strong>expires by itself after three days</strong>. If you never confirm the message we send you, nothing
			is ever written to the account database and there is nothing left to close: ignoring the mail is the whole of it.
		</p>

		<h2 className="mt-8 text-xl font-semibold text-palette-bg">Who at this platform can see your account</h2>

		{/*
		 * ⚠️ The disclosure this section exists for, and the reason it is a *list* of fields rather than a
		 * reassurance: `GraphQLUserActiveTbl` hands the admin `login.email` in the clear — deterministically
		 * encrypted, so the driver decrypts it — beside `registeredAt`, `emailVerify.valid`, `disabled`,
		 * `disabledBy` and `disabledReason`. Naming them is cheap and checkable; "we take your privacy
		 * seriously" is neither.
		 *
		 * The last sentence is about that screen, not about what the collection holds: `personalData` is on
		 * the document and no admin surface reads it. Phrasing it as an impossibility would be a promise
		 * this repo cannot keep — the notice says what the screen shows, which is what a reader can hold
		 * anyone to.
		 */}
		<p className="mt-2 text-slate-600">
			Accounts are administered by people who work on this platform. They have one screen for it, and it lists every account: the
			email address you sign in with, the day you registered, whether you have confirmed that address, and whether the account is
			suspended together with the reason given for it. Your name and the addresses you save are not on that screen.
		</p>

		{/*
		 * The two levers, said as consequences rather than as mutation names. Suspension revokes on the way
		 * in and not on the way out (`userUpdateStatus` calls `endEveryUserSession` only when `disabled` is
		 * true), and a closure revokes unconditionally — a customer reading this needs the part they can
		 * observe, which is being signed out and unable to return.
		 *
		 * ⚠️ "Names the admin rather than you" is `deletedBy` (ADR-044, ADR-048), and it is the one thing a
		 * data subject cannot see anywhere else: an account closed *for* them looks identical from outside
		 * to one they closed themselves, and the platform is the only party that knows which it was.
		 */}
		<p className="mt-4 text-slate-600">
			The same people can suspend an account and can close one. A suspension ends every session it has open at that moment and
			you cannot sign in again until an admin lifts it; the platform records which admin suspended it and the reason they gave. A
			closure works the same way and starts the thirty days described below, and what is recorded of it names the admin rather
			than you.
		</p>

		<h2 className="mt-8 text-xl font-semibold text-palette-bg">Closing an account</h2>

		{/*
		 * ADR-041's central sentence, said to the person it is about: a closed account is stamped, not removed.
		 * The document survives permanently — `_id`, `deleted`, `deletedBy`, `disabled`, the registration date
		 * and `scrubbedAt` — and saying otherwise here would be the promise the sweeper cannot keep.
		 */}
		<p className="mt-2 text-slate-600">
			Closing an account &mdash; your own, or one an admin closes &mdash; does not remove it from the database. It is marked as
			closed, every session it has open ends, and anything it had published goes off the marketplace at once. You cannot sign in
			with it from that moment.
		</p>

		{/*
		 * ⚠️ The undo, stated as a re-registration rather than as a login, because that is the only door
		 * ADR-046 built: `checkUserAuthorizationDisDel` refuses a closed account at the login gate on all three
		 * tiers. A reader who understood this as "sign in again within thirty days" would sit in front of the
		 * same generic refusal as somebody with no account at all, and conclude the undo does not exist.
		 */}
		<p className="mt-4 text-slate-600">
			For <strong>thirty days</strong> afterwards it can be brought back. Register again at the same email address and confirm
			the message we send you, and that same account returns &mdash; the same details, and for a seller the same shops and the
			same catalogue. What returns is <strong>unpublished</strong>, and a seller&rsquo;s account goes back into the approval
			queue, so an admin approves it once more first. A suspension is not lifted by any of this: if an admin suspended the
			account, it comes back suspended, and only an admin can take that off.
		</p>

		{/*
		 * The weakening, in the notice rather than only in the ADR's Consequences. Mailbox control alone
		 * recovers the account, and the person it matters to is the one whose work address is reassigned
		 * inside the window — who will not read an ADR and cannot act on what nobody told them.
		 */}
		<p className="mt-4 text-slate-600">
			Confirming that message is the whole of the check. Anyone able to read mail at the address during those thirty days can
			bring the account back and see what was in it, which is the same assumption a password reset makes &mdash; so if the
			address is one you are about to give up, closing the account is not the last step.
		</p>

		{/*
		 * ⚠️ "Overwritten in place", never "deleted". The `deleted-${_id}@invalid.local` placeholder is unique
		 * by construction and the row itself is permanent — a notice that said the account is deleted on day 30
		 * would be describing option A, the one ADR-041 declined.
		 */}
		<p className="mt-4 text-slate-600">
			After the thirty days the personal details are <strong>overwritten in place</strong>: the email address is replaced by one
			that cannot receive mail, the name by <em>Deleted User</em>, the password by a value nobody holds. What is left is a record
			that an account existed, when it closed and at whose instruction &mdash; and from that point nothing brings it back,
			because there is nothing left to bring.
		</p>

		{/*
		 * Said last and said plainly because it is the sentence a reader arrives looking for, and because the
		 * honest answer is a refusal: there is no erasure-on-request flow, no resolver behind one and no
		 * decision authorising one. Pointing at closure is not a substitute — it is what actually exists.
		 */}
		<p className="mt-4 text-slate-600">
			There is no separate &ldquo;erase my data&rdquo; request to make, and no queue one would go into. Closing the account
			starts the thirty days, and those thirty days are the shortest route there is.
		</p>
	</div>
)

export const privacyRouteOptions = { head, component: Privacy }
