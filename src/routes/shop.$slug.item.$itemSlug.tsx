import { createFileRoute } from '@tanstack/react-router'

import { shopItemRouteOptions } from '@/routeOptions/shopItem'

export const Route = createFileRoute('/shop/$slug/item/$itemSlug')(shopItemRouteOptions)
