import { createRootRouteWithContext } from '@tanstack/react-router'

import { rootRouteOptions } from '@/routeOptions/root'
import type { RouterContext } from '@/router'

/**
 * Every file under `src/routes/` is this thin, and that is the deviation README §3.1 records: the
 * options live in `src/routeOptions/`, as plain exported objects with no framework call in them, so they
 * can be unit-tested without a router. This file exists because the generator requires a file here.
 */
export const Route = createRootRouteWithContext<RouterContext>()(rootRouteOptions)
