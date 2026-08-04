import { createFileRoute } from '@tanstack/react-router'

import { shopsRouteOptions } from '@/routeOptions/shops'

export const Route = createFileRoute('/shops/')(shopsRouteOptions)
