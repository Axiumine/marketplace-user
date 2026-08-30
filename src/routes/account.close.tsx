import { createFileRoute } from '@tanstack/react-router'

import { accountCloseRouteOptions } from '@/routeOptions/accountClose'

export const Route = createFileRoute('/account/close')(accountCloseRouteOptions)
