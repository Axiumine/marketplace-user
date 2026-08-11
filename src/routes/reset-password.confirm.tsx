import { createFileRoute } from '@tanstack/react-router'

import { resetPasswordConfirmRouteOptions } from '@/routeOptions/resetPasswordConfirm'

export const Route = createFileRoute('/reset-password/confirm')(resetPasswordConfirmRouteOptions)
