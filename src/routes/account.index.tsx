import { createFileRoute } from '@tanstack/react-router'

import { accountProfileRouteOptions } from '@/routeOptions/accountProfile'

export const Route = createFileRoute('/account/')(accountProfileRouteOptions)
