import { createFileRoute } from '@tanstack/react-router'

import { resetPasswordRouteOptions } from '@/routeOptions/resetPassword'

export const Route = createFileRoute('/reset-password/')(resetPasswordRouteOptions)
