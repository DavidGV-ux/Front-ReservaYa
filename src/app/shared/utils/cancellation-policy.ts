import {
  Appointment,
  Cancellation,
  CancellationPolicy,
  CancellationRequestedBy,
  Tenant,
} from '../models/domain.model';

const HOUR_MS = 3_600_000;
const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_UPFRONT_PERCENT = 30;

export interface CancellationEstimate {
  policy: CancellationPolicy;
  withinWindow: boolean;
  windowHours: number;
  /** Anticipo pagado (0 si el pago no está aprobado). */
  advancePaid: number;
  refundAmount: number;
}

/** Estados en los que el back acepta cancelar (ver cancelAppointment en booking.usecases). */
export function isCancellable(appointment: Appointment, now = new Date()): boolean {
  return (
    (appointment.status === 'confirmed' || appointment.status === 'pending_payment') &&
    new Date(appointment.startTime).getTime() > now.getTime()
  );
}

/**
 * Vista previa de la política que aplica el back (domain/rules/cancellation-rules.ts):
 * - cliente con al menos `cancellationWindowHours` de anticipación → reembolso del 100 % del anticipo;
 * - cliente fuera de ese plazo → sin reembolso;
 * - owner/profesional → reembolso del 100 %.
 * El valor definitivo siempre es el que devuelve el back en `appointment.cancellation`.
 */
export function estimateCancellation(
  appointment: Appointment,
  tenant: Tenant | null | undefined,
  requestedBy: CancellationRequestedBy,
  now = new Date(),
): CancellationEstimate {
  const windowHours = tenant?.settings.cancellationWindowHours ?? DEFAULT_WINDOW_HOURS;
  const upfrontPercent = tenant?.settings.upfrontPercent ?? DEFAULT_UPFRONT_PERCENT;
  const msLeft = new Date(appointment.startTime).getTime() - now.getTime();
  const withinWindow = requestedBy !== 'client' || msLeft >= windowHours * HOUR_MS;

  const advancePaid =
    appointment.paymentStatus === 'approved'
      ? Math.round(appointment.serviceSnapshot.price * upfrontPercent) / 100
      : 0;

  let policy: CancellationPolicy;
  if (requestedBy === 'client') {
    policy = withinWindow ? 'client_within_window' : 'client_outside_window';
  } else if (requestedBy === 'system') {
    policy = 'system_cancelled';
  } else {
    policy = 'tenant_cancelled';
  }

  return {
    policy,
    withinWindow,
    windowHours,
    advancePaid,
    refundAmount: withinWindow ? advancePaid : 0,
  };
}

/** Construye la cancelación como lo haría el back; solo se usa en modo mock. */
export function buildMockCancellation(
  estimate: CancellationEstimate,
  requestedBy: CancellationRequestedBy,
  reason: string | undefined,
  at = new Date(),
): Cancellation {
  return {
    requestedBy,
    requestedAt: at.toISOString(),
    reason,
    policyApplied: estimate.policy,
    processingFee: 0,
    refundAmount: estimate.refundAmount,
    refundStatus: estimate.refundAmount > 0 ? 'pending' : 'not_applicable',
  };
}
