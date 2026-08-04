import { createFileRoute } from '@tanstack/react-router'

import { shopsCityRouteOptions } from '@/routeOptions/shopsCity'

export const Route = createFileRoute('/shops/$city')(shopsCityRouteOptions)
