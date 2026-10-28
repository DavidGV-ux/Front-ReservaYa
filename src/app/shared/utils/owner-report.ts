import { Appointment, Currency, LedgerEntry } from '../models/domain.model';

export interface ReportAppointmentStats {
  total: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
}

export interface ReportDay {
  /** Día en formato YYYY-MM-DD (hora local). */
  date: string;
  income: number;
  commission: number;
}

/**
 * Contrato propuesto para `GET /owner/:tenantId/reports?from=&to=` (pendiente en el back).
 * Mientras no exista, el front lo arma con `buildOwnerReport` a partir del ledger.
 */
export interface OwnerReport {
  from: string;
  to: string;
  currency: Currency;
  /** Abonos al saldo del negocio (asientos payment_approved en tenant_balance). */
  income: number;
  /** Comisión retenida por la plataforma (platform_commission en platform_revenue). */
  commission: number;
  /** Reembolsos a clientes (refund en customer_refund_liability). */
  refunds: number;
  /** income - refunds. */
  net: number;
  paymentsCount: number;
  /** null cuando la fuente de datos no trae citas del periodo. */
  appointments: ReportAppointmentStats | null;
  daily: ReportDay[];
  movements: LedgerEntry[];
  /** true si los datos salen de una fuente limitada (p. ej. últimos 50 movimientos del overview). */
  partial: boolean;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function inRange(iso: string, from: Date, to: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

export const isIncome = (m: LedgerEntry) =>
  m.type === 'payment_approved' && m.account === 'tenant_balance' && m.direction === 'credit';
export const isCommission = (m: LedgerEntry) =>
  m.type === 'platform_commission' && m.account === 'platform_revenue' && m.direction === 'credit';
export const isRefund = (m: LedgerEntry) => m.type === 'refund' && m.direction === 'debit';

/**
 * Arma el reporte del owner para el rango [from, to] (ambos inclusive).
 * Replica las reglas de dashboard.usecases del back para ingresos y comisión.
 */
export function buildOwnerReport(input: {
  movements: LedgerEntry[];
  appointments: Appointment[] | null;
  from: Date;
  to: Date;
  currency: Currency;
  partial?: boolean;
}): OwnerReport {
  const { from, to } = input;
  const movements = input.movements
    .filter((m) => m.status !== 'reversed' && m.status !== 'failed' && inRange(m.timestamp, from, to))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const sum = (pred: (m: LedgerEntry) => boolean) =>
    round(movements.filter(pred).reduce((s, m) => s + m.amount, 0));

  const income = sum(isIncome);
  const commission = sum(isCommission);
  const refunds = sum(isRefund);

  const days = new Map<string, ReportDay>();
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d);
    days.set(key, { date: key, income: 0, commission: 0 });
  }
  for (const m of movements) {
    const day = days.get(dayKey(new Date(m.timestamp)));
    if (!day) continue;
    if (isIncome(m)) day.income = round(day.income + m.amount);
    if (isCommission(m)) day.commission = round(day.commission + m.amount);
  }

  let appointments: ReportAppointmentStats | null = null;
  if (input.appointments) {
    const list = input.appointments.filter((a) => inRange(a.startTime, from, to));
    const count = (status: Appointment['status']) => list.filter((a) => a.status === status).length;
    appointments = {
      total: list.length,
      confirmed: count('confirmed'),
      completed: count('completed'),
      cancelled: count('cancelled'),
      noShow: count('no_show'),
    };
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    currency: input.currency,
    income,
    commission,
    refunds,
    net: round(income - refunds),
    paymentsCount: movements.filter(isIncome).length,
    appointments,
    daily: [...days.values()],
    movements,
    partial: input.partial ?? false,
  };
}
