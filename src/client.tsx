import './instrument'

import { StartClient } from '@tanstack/react-start/client'
import { startTransition, StrictMode } from 'react'
import { hydrateRoot } from 'react-dom/client'

/**
 * The browser entry. TanStack Start picks this up because it is `src/client.tsx` — the plugin resolves
 * `client.entry` by convention and falls back to its own copy of this file when the convention is not
 * met. The only reason to write it out is the first line: Sentry has to install its handlers before any
 * application module runs, or the errors it exists to catch happen before it is listening.
 *
 * ⚠️ `hydrateRoot(document, …)` — the whole document, not a `#root` div. That is not a stylistic choice:
 * the root route owns `<html>` through its `shellComponent`, so React is what rendered `<head>` on the
 * server and React has to be what adopts it here. This is the one structural difference from the two
 * SPAs, which mount into a `div` inside a hand-written `index.html`. There is no `index.html` in this
 * repo at all.
 *
 * `startTransition` marks hydration as interruptible, so a click during it is handled instead of being
 * dropped — a real case on a catalogue page whose first paint arrives well before its JavaScript.
 *
 * `./styles.css` is deliberately *not* imported here. It is imported by the root route instead, which is
 * what lets the SSR build see it and emit the `<link rel="stylesheet">` in the server HTML; importing it
 * from the client entry alone would leave the first paint unstyled.
 */
startTransition(() => {
	hydrateRoot(
		document,
		<StrictMode>
			<StartClient />
		</StrictMode>
	)
})
