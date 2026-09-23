export interface Plan {
  id: string;
  name: 'basico' | 'pro';
  commissionRate: number;
  active: boolean;
  version: number;
}

export type Currency = 'COP' | 'USD';
export type LanguageCode = 'es' | 'en';
export type BookingStatus = 'active' | 'suspended' | 'migration';

export interface TenantConfig {
  defaultLanguage: LanguageCode;
  activeLanguages: LanguageCode[];
  cancellationWindowHours: number;
  reminderHours: number;
  upfrontPercent: number;
  paymentTimeoutMinutes: number;
  whatsappPhoneNumberId?: string;
}

export interface Tenant {
  id: string;
  tenantId: string;
  slug: string;
  planId: string;
  name: string;
  tagline: string;
  description: string;
  timezone: string;
  currency: Currency;
  logoUrl?: string;
  coverUrl?: string;
  address?: string;
  phone?: string;
  settings: TenantConfig;
  bookingStatus: BookingStatus;
  version: number;
}

export interface Service {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  price: number;
  currency: Currency;
  durationMinutes: number;
  active: boolean;
  version: number;
}

export interface Professional {
  id: string;
  tenantId: string;
  name: string;
  title?: string;
  avatarUrl?: string;
  serviceIds: string[];
  active: boolean;
  keycloakUserId?: string;
  version: number;
}

export interface DailySchedule {
  dayOfWeek: number;
  start: string;
  end: string;
}

export interface ProfessionalSchedule {
  days: DailySchedule[];
  blocks?: AvailabilityBlock[];
}

export type AppointmentStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'completed'
  | 'no_show'
  | 'cancelled'
  | 'expired'
  | 'needs_reassignment';

export type PaymentStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'refunded'
  | 'partially_refunded';

export type AppointmentSource = 'web' | 'whatsapp' | 'admin';

export interface ServiceSnapshot {
  serviceId: string;
  name: string;
  price: number;
  currency: Currency;
  durationMinutes: number;
}

export interface ClientInfo {
  name: string;
  phone?: string;
  email?: string;
  habeasDataConsent: boolean;
  habeasDataConsentAt?: string;
}

export type CancellationRequestedBy = 'client' | 'owner' | 'professional' | 'system';

export type CancellationPolicy =
  | 'client_within_window'
  | 'client_outside_window'
  | 'tenant_cancelled'
  | 'no_show'
  | 'system_cancelled';

export type RefundStatus = 'not_applicable' | 'pending' | 'approved' | 'failed';

/** Mismo contrato que `Cancellation` del back (domain/entities/appointment.ts). */
export interface Cancellation {
  requestedBy: CancellationRequestedBy;
  requestedAt: string;
  reason?: string;
  policyApplied: CancellationPolicy;
  processingFee: number;
  refundAmount: number;
  refundStatus: RefundStatus;
  refundReference?: string;
  resolvedAt?: string;
}

export interface Appointment {
  id: string;
  tenantId: string;
  professionalId: string;
  serviceId: string;
  serviceSnapshot: ServiceSnapshot;
  commissionRateSnapshot: number;
  planIdSnapshot: string;
  idempotencyKey?: string;
  source: AppointmentSource;
  paymentReference?: string;
  latestPaymentTransactionId?: string;
  clientInfo: ClientInfo;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  paymentStatus: PaymentStatus;
  cancellation?: Cancellation;
  needsReassignment: boolean;
  version: number;
}

export interface AvailabilityBlock {
  id: string;
  tenantId: string;
  professionalId: string;
  startTime: string;
  endTime: string;
  reason?: string;
  status: 'active' | 'cancelled';
  version: number;
}

export type SlotOccupation = 'appointment' | 'block';

export interface TimeSlot {
  id: string;
  tenantId: string;
  professionalId: string;
  slotStart: string;
  occupationType?: SlotOccupation;
  appointmentId?: string;
  blockId?: string;
}

export type PaymentOperation = 'charge' | 'refund' | 'chargeback' | 'payout';
export type PaymentProviderStatus = 'pending' | 'approved' | 'declined' | 'failed' | 'refunded' | 'partially_refunded';

export interface PaymentTransaction {
  id: string;
  tenantId: string;
  appointmentId: string;
  provider: string;
  providerTransactionId?: string;
  providerEventId?: string;
  internalReference: string;
  operation: PaymentOperation;
  amount: number;
  currency: Currency;
  status: PaymentProviderStatus;
  metadata?: Record<string, unknown>;
  version: number;
}

export type LedgerType =
  | 'payment_approved'
  | 'payment_rejected'
  | 'platform_commission'
  | 'tenant_credit'
  | 'refund'
  | 'processing_fee'
  | 'payout_weekly'
  | 'balance_adjustment';

export type LedgerAccount =
  | 'tenant_balance'
  | 'platform_revenue'
  | 'customer_refund_liability'
  | 'payout_liability'
  | 'payment_event';

export type LedgerDirection = 'credit' | 'debit' | 'neutral';
export type LedgerStatus = 'pending' | 'posted' | 'reversed' | 'failed';

export interface LedgerEntry {
  id: string;
  tenantId: string;
  transactionId: string;
  appointmentId?: string;
  payoutId?: string;
  paymentTransactionId?: string;
  paymentReference?: string;
  type: LedgerType;
  account: LedgerAccount;
  direction: LedgerDirection;
  amount: number;
  currency: Currency;
  commissionRateSnapshot?: number;
  status: LedgerStatus;
  idempotencyKey?: string;
  source?: string;
  sourceEventId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface Notification {
  id: string;
  tenantId: string;
  appointmentId: string;
  channel: 'whatsapp' | 'email' | 'sms';
  type: 'confirmation' | 'reminder' | 'cancellation';
  status: 'pending' | 'sent' | 'failed' | 'fallback_sent';
  providerMessageId?: string;
  attempts: number;
  lastError?: string;
  archived: boolean;
}

export interface AppointmentGroup {
  appointment: Appointment;
  service: ServiceSnapshot;
  professional?: Professional;
}

export interface LedgerSummary {
  balance: number;
  commissionWithheld: number;
  movements: LedgerEntry[];
}