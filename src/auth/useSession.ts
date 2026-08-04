import { useSyncExternalStore } from 'react'

import { getServerSession, getSession, type Session, subscribeSession } from '@/auth/session'

/**
 * Reads the module-level session store.
 *
 * The third argument is the server snapshot, and it is required rather than optional here: without it
 * React throws during any server render that reaches this hook, and with a wrong one it would emit
 * signed-in HTML that the first client render immediately contradicts — a hydration mismatch that
 * shows up as a flash of the wrong header. Always signed out is the only honest answer the server can
 * give; see the note in src/auth/session.ts.
 */
export const useSession = (): Session => useSyncExternalStore(subscribeSession, getSession, getServerSession)
