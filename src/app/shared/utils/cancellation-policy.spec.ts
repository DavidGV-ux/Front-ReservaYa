import { describe, expect, it } from 'vitest';
import { MOCK_APPOINTMENTS } from '../mocks/dashboard.mock';
import { MOCK_TENANT } from '../mocks/tenant.mock';
import { Appointment } from '../models/domain.model';
import { buildMockCancellation, estimateCancellation, isCancellable } from './cancellation-policy';

const NOW = new Date('2026-09-23T12:00:00Z');
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

function appt(overrides: Partial<Appointment> = {}): Appointment {
  return {
    ...MOCK_APPOINTMENTS[0],
    status: 'confirmed',
    paymentStatus: 'approved',
    serviceSnapshot: { ...MOCK_APPOINTMENTS[0].serviceSnapshot, price: 100_000 },
    startTime: hoursFromNow(48),
    endTime: hoursFromNow(49),
    ...overrides,
  };
}

const tenant = {
  ...MOCK_TENANT,
  settings: { ...MOCK_TENANT.settings, cancellationWindowHours: 24, upfrontPercent: 30 },
};

describe('isCancellable', () => {
  it('permite cancelar citas confirmadas o pendientes de pago en el futuro', () => {
    expect(isCancellable(appt(), NOW)).toBe(true);
    expect(isCancellable(appt({ status: 'pending_payment' }), NOW)).toBe(true);
  });

  it('no permite cancelar citas pasadas ni en estado terminal', () => {
    expect(isCancellable(appt({ startTime: hoursFromNow(-1) }), NOW)).toBe(false);
    for (const status of ['cancelled', 'completed', 'no_show', 'expired'] as const) {
      expect(isCancellable(appt({ status }), NOW)).toBe(false);
    }
  });
});

describe('estimateCancellation', () => {
  it('cliente dentro del plazo: reembolso del 100 % del anticipo', () => {
    const e = estimateCancellation(appt(), tenant, 'client', NOW);
    expect(e.policy).toBe('client_within_window');
    expect(e.advancePaid).toBe(30_000);
    expect(e.refundAmount).toBe(30_000);
  });

  it('cliente justo en el límite del plazo sigue dentro de la ventana', () => {
    const e = estimateCancellation(appt({ startTime: hoursFromNow(24) }), tenant, 'client', NOW);
    expect(e.withinWindow).toBe(true);
  });

  it('cliente fuera del plazo: sin reembolso', () => {
    const e = estimateCancellation(appt({ startTime: hoursFromNow(5) }), tenant, 'client', NOW);
    expect(e.policy).toBe('client_outside_window');
    expect(e.refundAmount).toBe(0);
  });

  it('owner: reembolso completo aunque falte poco', () => {
    const e = estimateCancellation(appt({ startTime: hoursFromNow(1) }), tenant, 'owner', NOW);
    expect(e.policy).toBe('tenant_cancelled');
    expect(e.refundAmount).toBe(30_000);
  });

  it('sin pago aprobado no hay nada que reembolsar', () => {
    const e = estimateCancellation(appt({ paymentStatus: 'pending' }), tenant, 'client', NOW);
    expect(e.advancePaid).toBe(0);
    expect(e.refundAmount).toBe(0);
  });

  it('usa la ventana configurada por el negocio', () => {
    const strict = { ...tenant, settings: { ...tenant.settings, cancellationWindowHours: 72 } };
    expect(estimateCancellation(appt(), strict, 'client', NOW).withinWindow).toBe(false);
  });
});

describe('buildMockCancellation', () => {
  it('marca el reembolso como pendiente cuando hay monto', () => {
    const e = estimateCancellation(appt(), tenant, 'client', NOW);
    const c = buildMockCancellation(e, 'client', 'viaje', NOW);
    expect(c).toMatchObject({
      requestedBy: 'client',
      policyApplied: 'client_within_window',
      refundAmount: 30_000,
      refundStatus: 'pending',
      reason: 'viaje',
    });
  });

  it('marca not_applicable cuando no hay reembolso', () => {
    const e = estimateCancellation(appt({ startTime: hoursFromNow(2) }), tenant, 'client', NOW);
    expect(buildMockCancellation(e, 'client', undefined, NOW).refundStatus).toBe('not_applicable');
  });
});
