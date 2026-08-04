import { createFileRoute } from '@tanstack/react-router'

import { categoryChildRouteOptions } from '@/routeOptions/categoryChild'

export const Route = createFileRoute('/category/$slug/$childSlug')(categoryChildRouteOptions)
