import { createFileRoute } from '@tanstack/react-router'

import { accountAddressesRouteOptions } from '@/routeOptions/accountAddresses'

export const Route = createFileRoute('/account/addresses')(accountAddressesRouteOptions)
