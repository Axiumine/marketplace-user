import { createFileRoute } from '@tanstack/react-router'

import { searchRouteOptions } from '@/routeOptions/search'

export const Route = createFileRoute('/search')(searchRouteOptions)
