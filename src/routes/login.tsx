import { createFileRoute } from '@tanstack/react-router'

import { loginRouteOptions } from '@/routeOptions/login'

export const Route = createFileRoute('/login')(loginRouteOptions)
