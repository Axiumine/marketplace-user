import { createFileRoute } from '@tanstack/react-router'

import { categoryRouteOptions } from '@/routeOptions/category'

export const Route = createFileRoute('/category/$slug/')(categoryRouteOptions)
