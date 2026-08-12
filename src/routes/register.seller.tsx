import { createFileRoute } from '@tanstack/react-router'

import { registerSellerRouteOptions } from '@/routeOptions/registerSeller'

export const Route = createFileRoute('/register/seller')(registerSellerRouteOptions)
