import { createFileRoute } from '@tanstack/react-router'

import { homeRouteOptions } from '@/routeOptions/home'

export const Route = createFileRoute('/')(homeRouteOptions)
