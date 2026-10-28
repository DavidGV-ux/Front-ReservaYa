import { describe, expect, it } from 'vitest';
import { Appointment, LedgerEntry } from '../models/domain.model';
import { MOCK_APPOINTMENTS } from '../mocks/dashboard.mock';
import { buildOwnerReport, dayKey } from './owner-report';

const entry = (overrides: Partial<LedgerEntry>): LedgerEntry => ({
  id: 'led',
  tenantId: 't1',
  transactionId: 'tx',
  type: 'payment_approved',
  account: 'tenant_balance',
  direction: 'credit',
  amount: 0,
  currency: 'COP',
  status: 'posted',
  timestamp: new Date(2026, 8, 10, 10).toISOString(),
  ...overrides,
});

const from = new Date(2026, 8, 10);
const to = new Date(2026, 8, 12, 23, 59, 59, 999);

describe('buildOwnerReport', () => {
  const movements = [
    entry({ id: 'a', amount: 28_500 }),
    entry({ id: 'b', type: 'platform_commission', account: 'platform_revenue', amount: 1_500 }),
    entry({ id: 'c', amount: 19_000, timestamp: new Date(2026, 8, 12, 18).toISOString() }),
    entry({
      id: 'd',
      type: 'refund',
      account: 'customer_refund_liability',
      direction: 'debit',
      amount: 10_000,
      timestamp: new Date(2026, 8, 11, 9).toISOString(),
    }),
    // Fuera del rango y anulados: no deben contar.
    entry({ id: 'e', amount: 99_999, timestamp: new Date(2026, 8, 13, 1).toISOString() }),
    entry({ id: 'f', amount: 55_555, status: 'reversed' }),
  ];

  const report = buildOwnerReport({ movements, appointments: null, from, to, currency: 'COP' });

  it('suma ingresos, comisión y reembolsos del rango', () => {
    expect(report.income).toBe(47_500);
    expect(report.commission).toBe(1_500);
    expect(report.refunds).toBe(10_000);
    expect(report.net).toBe(37_500);
    expect(report.paymentsCount).toBe(2);
  });

  it('excluye movimientos fuera del rango o anulados', () => {
    expect(report.movements.map((m) => m.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('genera un día por cada fecha del rango, aunque no tenga movimientos', () => {
    expect(report.daily.map((d) => d.date)).toEqual(['2026-09-10', '2026-09-11', '2026-09-12']);
    expect(report.daily[0]).toMatchObject({ income: 28_500, commission: 1_500 });
    expect(report.daily[1]).toMatchObject({ income: 0, commission: 0 });
    expect(report.daily[2].income).toBe(19_000);
  });

  it('ordena los movimientos del más reciente al más antiguo', () => {
    expect(report.movements[0].id).toBe('c');
  });

  it('sin citas deja las estadísticas en null', () => {
    expect(report.appointments).toBeNull();
  });

  it('cuenta citas del periodo por estado', () => {
    const base = MOCK_APPOINTMENTS[0];
    const at = (d: number, status: Appointment['status']): Appointment => ({
      ...base,
      status,
      startTime: new Date(2026, 8, d, 10).toISOString(),
    });
    const r = buildOwnerReport({
      movements: [],
      appointments: [at(10, 'completed'), at(11, 'cancelled'), at(12, 'confirmed'), at(20, 'confirmed')],
      from,
      to,
      currency: 'COP',
    });
    expect(r.appointments).toEqual({ total: 3, confirmed: 1, completed: 1, cancelled: 1, noShow: 0 });
  });
});

describe('dayKey', () => {
  it('usa la fecha local con ceros a la izquierda', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
