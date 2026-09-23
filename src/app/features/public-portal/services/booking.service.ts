import { Injectable, inject, signal } from '@angular/core';
import { map, Observable, of, throwError, delay } from 'rxjs';
import { environment } from '../../../core/config/environment';
import { ApiService } from '../../../core/http/api.service';
import {
  BackendAppointment,
  BookingIntent,
  BookingResult,
  mapAppointment,
} from '../../../core/http/api-mappers';
import { AvailabilityService } from './availability.service';
import { TenantService } from './tenant.service';
import { MOCK_APPOINTMENTS } from '../../../shared/mocks/dashboard.mock';
import { MOCK_PROFESSIONALS, MOCK_SERVICES, MOCK_TENANT } from '../../../shared/mocks/tenant.mock';
import {
  Appointment,
  AppointmentSource,
  ClientInfo,
  Service,
} from '../../../shared/models/domain.model';
import { buildMockCancellation, estimateCancellation } from '../../../shared/utils/cancellation-policy';

/** Quién cancela desde el front; el back solo expone rutas para cliente (público) y owner. */
export type CancelActor = 'client' | 'owner';

export interface BookingRequest {
  tenantId: string;
  serviceId: string;
  professionalId: string;
  startTime: Date;
  clientInfo: ClientInfo;
  source?: AppointmentSource;
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly api = inject(ApiService);
  private readonly availability = inject(AvailabilityService);
  private readonly tenants = inject(TenantService);

  private readonly sessionAppointments = signal<Appointment[]>([]);
  private readonly counter = signal(0);

  readonly appointments = this.sessionAppointments.asReadonly();

  /** Cancelaciones hechas en modo mock, para que se reflejen al volver a listar. */
  private readonly mockCancelled = signal(new Map<string, Appointment>());

  /** Aplica las cancelaciones mock sobre una lista de citas de prueba. */
  withMockCancellations(list: Appointment[]): Appointment[] {
    const cancelled = this.mockCancelled();
    return cancelled.size ? list.map((a) => cancelled.get(a.id) ?? a) : list;
  }

  private lastIntent: BookingIntent | null = null;

  paymentIntent(): BookingIntent | null {
    return this.lastIntent;
  }

  create(request: BookingRequest): Observable<Appointment> {
    if (!environment.useMockBackend) {
      return this.api
        .post<BookingResult>(`/public/${request.tenantId}/appointments`, {
          serviceId: request.serviceId,
          professionalId: request.professionalId,
          startTime: new Date(request.startTime).toISOString(),
          clientInfo: {
            name: request.clientInfo.name,
            phone: request.clientInfo.phone,
            email: request.clientInfo.email,
            habeasDataConsent: true,
            habeasDataConsentAt: new Date().toISOString(),
          },
          source: request.source ?? 'web',
        })
        .pipe(
          map((result) => {
            this.lastIntent = {
              advanceAmount: result.intent.advanceAmount,
              currency: result.intent.currency,
              paymentReference:
                result.intent.paymentReference ?? result.appointment.paymentReference ?? '',
              chargeMode: result.intent.chargeMode,
              publicKey: result.intent.publicKey,
              amountInCents: result.intent.amountInCents,
              signatureIntegrity: result.intent.signatureIntegrity,
            };
            return mapAppointment(result.appointment);
          }),
        );
    }

    const service = this.serviceById(request.serviceId);
    const start = new Date(request.startTime);
    const end = new Date(start.getTime() + service.durationMinutes * 60000);

    if (this.availability.hasOverlap(request.professionalId, start, end)) {
      return throwError(
        () => new Error('AvailabilityConflict: the requested slot is no longer available'),
      );
    }

    const index = this.counter() + 1;
    this.counter.set(index);
    const reference = `RSV-${Date.now().toString(36).toUpperCase()}${index}`;
    const now = new Date();

    const appointment: Appointment = {
      id: `appt_session_${index}`,
      tenantId: request.tenantId,
      professionalId: request.professionalId,
      serviceId: request.serviceId,
      serviceSnapshot: {
        serviceId: service.id,
        name: service.name,
        price: service.price,
        currency: MOCK_TENANT.currency,
        durationMinutes: service.durationMinutes,
      },
      commissionRateSnapshot: 0.05,
      planIdSnapshot: MOCK_TENANT.planId,
      idempotencyKey: `${reference}-${now.getTime()}`,
      source: request.source ?? 'web',
      clientInfo: request.clientInfo,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      status: 'pending_payment',
      paymentStatus: 'pending',
      needsReassignment: false,
      version: 1,
    };

    this.availability.reserve(request.professionalId, start, end);
    this.sessionAppointments.update((list) => [...list, appointment]);
    return of(appointment).pipe(delay(400));
  }

  approvePayment(appointment: Appointment): Observable<Appointment> {
    if (!environment.useMockBackend) {
      const intent = this.lastIntent;
      const reference = appointment.paymentReference ?? intent?.paymentReference;
      if (!reference || !intent) {
        return throwError(() => new Error('no payment intent available'));
      }
      return this.api
        .post<{ handled: boolean; appointment?: BackendAppointment }>(
          '/webhooks/demo/payments/approve',
          {
            reference,
            amount: intent.advanceAmount,
            currency: intent.currency,
            tenantId: appointment.tenantId,
          },
        )
        .pipe(
          map((result) => {
            if (result.appointment) {
              return mapAppointment(result.appointment);
            }
            return {
              ...appointment,
              status: 'confirmed' as const,
              paymentStatus: 'approved' as const,
            };
          }),
        );
    }

    const confirmed: Appointment = {
      ...appointment,
      status: 'confirmed',
      paymentStatus: 'approved',
      paymentReference: appointment.paymentReference ?? `PAY-REF-${appointment.id}`,
    };

    this.sessionAppointments.update((list) =>
      list.map((a) => (a.id === appointment.id ? confirmed : a)),
    );

    return of(confirmed).pipe(delay(600));
  }

  /**
   * Cancela una cita. El cliente usa la ruta pública y el owner la suya
   * (el back aplica reembolso completo cuando cancela el negocio).
   */
  cancel(appointment: Appointment, by: CancelActor, reason?: string): Observable<Appointment> {
    const body = reason?.trim() ? { reason: reason.trim() } : {};
    if (!environment.useMockBackend) {
      const request =
        by === 'owner'
          ? this.api.post<BackendAppointment>(
              `/owner/${appointment.tenantId}/appointments/${appointment.id}/cancel`,
              body,
              appointment.tenantId,
            )
          : this.api.post<BackendAppointment>(
              `/public/${appointment.tenantId}/appointments/${appointment.id}/cancel`,
              body,
            );
      return request.pipe(map(mapAppointment));
    }

    const estimate = estimateCancellation(appointment, this.tenants.currentTenant() ?? MOCK_TENANT, by);
    const cancelled: Appointment = {
      ...appointment,
      status: 'cancelled',
      paymentStatus: estimate.refundAmount > 0 ? 'pending' : appointment.paymentStatus,
      cancellation: buildMockCancellation(estimate, by, body.reason),
    };
    this.mockCancelled.update((m) => new Map(m).set(appointment.id, cancelled));

    const notified = this.sessionAppointments().some((a) => a.id === appointment.id);
    if (notified) {
      this.availability.release(
        appointment.professionalId,
        new Date(appointment.startTime),
        new Date(appointment.endTime),
      );
      this.sessionAppointments.update((list) =>
        list.map((a) => (a.id === appointment.id ? cancelled : a)),
      );
    }
    return of(cancelled).pipe(delay(200));
  }

  history(clientPhone?: string): Observable<Appointment[]> {
    if (!environment.useMockBackend) {
      const tenantId = this.tenants.currentTenant()?.tenantId;
      if (!tenantId) return of([]);
      const qs = clientPhone ? `?phone=${encodeURIComponent(clientPhone)}` : '';
      return this.api
        .get<BackendAppointment[]>(`/public/${tenantId}/appointments/history${qs}`)
        .pipe(map((list) => list.map(mapAppointment)));
    }

    const all = this.withMockCancellations([...this.sessionAppointments(), ...MOCK_APPOINTMENTS]);
    const filtered = clientPhone
      ? all.filter((a) => a.clientInfo.phone === clientPhone)
      : all;
    return of(
      filtered.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()),
    );
  }

  getById(tenantId: string, appointmentId: string): Observable<Appointment> {
    if (!environment.useMockBackend) {
      return this.api
        .get<BackendAppointment>(`/public/${tenantId}/appointments/${appointmentId}`)
        .pipe(map(mapAppointment));
    }
    const all = [...this.sessionAppointments(), ...MOCK_APPOINTMENTS];
    const match = all.find((a) => a.id === appointmentId);
    return match ? of(match) : throwError(() => new Error('appointment not found'));
  }

  serviceById(id: string): Service {
    const service = MOCK_SERVICES.find((s) => s.id === id);
    if (!service) {
      throw new Error(`ServiceNotFound: ${id}`);
    }
    return service;
  }
}