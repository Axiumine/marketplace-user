import { createFileRoute } from '@tanstack/react-router'

import { accountPasswordRouteOptions } from '@/routeOptions/accountPassword'

export const Route = createFileRoute('/account/password')(accountPasswordRouteOptions)
