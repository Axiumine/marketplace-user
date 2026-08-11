import { createFileRoute } from '@tanstack/react-router'

import { privacyRouteOptions } from '@/routeOptions/privacy'

export const Route = createFileRoute('/privacy')(privacyRouteOptions)
