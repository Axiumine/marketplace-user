import { createFileRoute } from '@tanstack/react-router'

import { registerRouteOptions } from '@/routeOptions/register'

export const Route = createFileRoute('/register/')(registerRouteOptions)
