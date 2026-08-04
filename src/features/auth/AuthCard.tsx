import type { ReactNode } from 'react'

/**
 * The shell every authentication screen sits in: one narrow column, one `<h1>`, one card.
 *
 * Narrow on purpose — a login form stretched across a desktop viewport puts the label at one end of the
 * screen and the field at the other, and the eye loses the association the `<label for>` was there to
 * make.
 */
export interface AuthCardProps {
	readonly title: string
	readonly intro?: string
	readonly children: ReactNode
	readonly footer?: ReactNode
}

export const AuthCard = ({ title, intro, children, footer }: AuthCardProps) => (
	<div className="mx-auto max-w-md px-4 py-10">
		<h1 className="text-2xl font-semibold text-palette-bg">{title}</h1>

		{intro !== undefined && <p className="mt-2 text-sm text-slate-600">{intro}</p>}

		<div className="mt-6 rounded-box border border-slate-200 bg-white p-5">{children}</div>

		{footer !== undefined && <div className="mt-4 text-sm text-slate-600">{footer}</div>}
	</div>
)
