import { headFor } from '@/lib/seo'

/**
 * `/privacy` — the platform's first privacy notice, and deliberately the smallest one that is true.
 *
 * ⚠️ **This page is the public half of a configuration, not a compliance document.** The edge keeps two
 * log files that record something about a visitor, and the platform owner's answer of 2026-08-11 was that
 * their *lifetime* is the control rather than their content — 14 days, shredded on removal. That answer
 * has two halves: `marketplace-nginx/logrotate.d/nginx` in the parent workspace configures it, and this
 * page states it. A page promising a period the configuration does not keep is a false statement, so the
 * two are edited together or not at all — the configuration is the source of truth and this text follows
 * it, never the other way round.
 *
 * ⚠️ **Nothing here describes a process nobody operates.** No lawful basis, no controller identity, no
 * retention period for anything but these two files, no access or erasure flow: none of those has a
 * decision behind it yet (`RISK_REGISTER` R25, `phase1/NFR.md` open question 1), and a notice that
 * describes an imaginary procedure is worse than a short one that describes a real one. Add a paragraph
 * here when a decision exists, not when a template suggests one.
 *
 * It is a **public, indexable** page on purpose: `noIndex` is not set and `robots.txt` does not disallow
 * it. A statement a data subject cannot find is not a statement, and the two panel apps are behind a
 * login — which is why this lives in the one app an anonymous visitor can reach.
 */
const head = () =>
	headFor({
		title: 'Privacy',
		description: 'What this site records about a visit, and for how long.',
		path: '/privacy'
	})

const Privacy = () => (
	<div className="mx-auto max-w-3xl px-4 py-8">
		<h1 className="text-3xl font-semibold text-palette-bg">Privacy</h1>
		<p className="mt-2 text-slate-600">
			What the web server records about a visit to this site, and for how long it is kept. This page covers those log files and
			nothing else; anything more will be added here when it has been decided, rather than described in advance.
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
	</div>
)

export const privacyRouteOptions = { head, component: Privacy }
