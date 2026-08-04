import { createFileRoute } from '@tanstack/react-router'

import { shopRouteOptions } from '@/routeOptions/shop'

export const Route = createFileRoute('/shop/$slug/')(shopRouteOptions)
