import { createFileRoute } from '@tanstack/react-router'

import { accountRouteOptions } from '@/routeOptions/account'

export const Route = createFileRoute('/account')(accountRouteOptions)
