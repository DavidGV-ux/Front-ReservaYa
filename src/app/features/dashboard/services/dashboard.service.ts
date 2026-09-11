import { Injectable, inject } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { environment } from '../../../core/config/environment';
import { ApiService } from '../../../core/http/api.service';
import {
  BackendTenant,
  BackendAppointment,
  mapAppointment,
  mapTenant,
  TenantMembership,
} from '../../../core/http/api-mappers';
import { OWNER_TENANT_KEY } from '../../../features/platform/pages/business-setup/business-setup.page';
import { MOCK_APPOINTMENTS } from '../../../shared/mocks/dashboard.mock';
import { MOCK_PROFESSIONALS, MOCK_SERVICES, MOCK_TENANT } from '../../../shared/mocks/tenant.mock';
import { Appointment, LedgerEntry, Professional, Service, Tenant } from '../../../shared/models/domain.model';

export interface OwnerOverview {
  tenant: Tenant;
  revenue: number;
  totalAppointments: number;
  confirmedToday: number;
  occupancy: number;
  commission: number;
  commissionRate: number;
  upcoming: Appointment[];
  movements: LedgerEntry[];
  owner: { keycloakUserId: string; role: string };
}

export interface ProfessionalAgenda {
  professionalId: string;
  appointments: Appointment[];
  blocks: Array<{ id: string; startTime: string; endTime: string; reason?: string }>;
}

export interface AdminTenantRow {
  slug: string;
  name: string;
  country: string;
  plan: string;
  commission: number;
  status: 'active' | 'suspended';
}

interface BackendOwnerOverview {
  tenant: BackendTenant;
  revenue: number;
  totalAppointments: number;
  confirmedToday: number;
  occupancy: number;
  commission: number;
  commissionRate: number;
  upcoming: BackendAppointment[];
  movements: LedgerEntry[];
  owner: { keycloakUserId: string; role: string };
}

interface BackendAgenda {
  professionalId: string;
  appointments: BackendAppointment[];
  blocks: Array<{ id: string; startTime: string; endTime: string; reason?: string }>;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);

  myTenants(): Observable<TenantMembership[]> {
    if (environment.useMockBackend) {
      return of([
        {
          tenantId: MOCK_TENANT.tenantId,
          slug: MOCK_TENANT.slug,
          name: MOCK_TENANT.name,
          role: 'owner',
        },
      ]);
    }
    return this.api.get<TenantMembership[]>('/me/tenants');
  }

  /**
   * Objeto owner (owner/role) propio que resuelve el dashboard del dueño:
   * primero el tenant guardado en localStorage (alta self-service del negocio),
   * y como respaldo la primera membresía `owner` devuelta por `/me/tenants`.
   */
  ownerContext(): Observable<TenantMembership | null> {
    const stored =
      typeof localStorage !== 'undefined' ? localStorage.getItem(OWNER_TENANT_KEY) : null;
    if (environment.useMockBackend) {
      return of({
        tenantId: stored ?? MOCK_TENANT.tenantId,
        slug: MOCK_TENANT.slug,
        name: MOCK_TENANT.name,
        role: 'owner',
      });
    }
    return this.myTenants().pipe(
      map((list) => {
        const preferred = list.find((m) => m.tenantId === stored);
        if (preferred) return preferred;
        return list.find((m) => m.role === 'owner') ?? null;
      }),
    );
  }

  roleContext(role: 'owner' | 'professional' | 'client'): Observable<TenantMembership | null> {
    if (environment.useMockBackend) {
      return of({
        tenantId: MOCK_TENANT.tenantId,
        slug: MOCK_TENANT.slug,
        name: MOCK_TENANT.name,
        role,
      });
    }
    return this.myTenants().pipe(map((list) => list.find((m) => m.role === role) ?? null));
  }

  ownerOverview(tenantId: string): Observable<OwnerOverview> {
    if (environment.useMockBackend) {
      return of(this.mockOverview());
    }
    return this.api
      .get<BackendOwnerOverview>(`/owner/${tenantId}/overview`, tenantId)
      .pipe(
        map((o) => ({
          tenant: mapTenant(o.tenant),
          revenue: o.revenue,
          totalAppointments: o.totalAppointments,
          confirmedToday: o.confirmedToday,
          occupancy: o.occupancy,
          commission: o.commission,
          commissionRate: o.commissionRate,
          upcoming: o.upcoming.map(mapAppointment),
          movements: o.movements,
          owner: o.owner,
        })),
      );
  }

  ownerServices(tenantId: string): Observable<Service[]> {
    if (environment.useMockBackend) {
      return of(MOCK_SERVICES);
    }
    return this.api.get<Service[]>(`/owner/${tenantId}/services`, tenantId);
  }

  ownerProfessionals(tenantId: string, serviceId?: string): Observable<Professional[]> {
    if (environment.useMockBackend) {
      return of(MOCK_PROFESSIONALS);
    }
    const qs = serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : '';
    return this.api.get<Professional[]>(`/owner/${tenantId}/professionals${qs}`, tenantId);
  }

  clientAppointments(tenantId: string): Observable<Appointment[]> {
    if (environment.useMockBackend) {
      return of(MOCK_APPOINTMENTS);
    }
    return this.api
      .get<BackendAppointment[]>(`/client/${tenantId}/appointments`, tenantId)
      .pipe(map((list) => list.map(mapAppointment)));
  }

  professionalAgenda(tenantId: string, from: string, to: string): Observable<ProfessionalAgenda> {
    if (environment.useMockBackend) {
      return of({
        professionalId: MOCK_PROFESSIONALS[0].id,
        appointments: MOCK_APPOINTMENTS,
        blocks: [],
      });
    }
    return this.api
      .get<BackendAgenda>(
        `/professional/${tenantId}/agenda?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        tenantId,
      )
      .pipe(
        map((a) => ({
          professionalId: a.professionalId,
          appointments: a.appointments.map(mapAppointment),
          blocks: a.blocks,
        })),
      );
  }

  adminTenants(): Observable<AdminTenantRow[]> {
    if (environment.useMockBackend) {
      return of([
        {
          slug: 'barber-estilo',
          name: 'Barber Estilo',
          country: 'CO',
          plan: 'Básico',
          commission: 5,
          status: 'active',
        },
        {
          slug: 'clinica-vida',
          name: 'Clínica Vida',
          country: 'US',
          plan: 'Pro',
          commission: 3,
          status: 'active',
        },
      ]);
    }
    return this.api.get<AdminTenantRow[]>('/admin/tenants');
  }

  private mockOverview(): OwnerOverview {
    const movements = MOCK_APPOINTMENTS.filter((a) => a.paymentStatus === 'approved').map(
      (a, i): LedgerEntry => {
        const gross = a.serviceSnapshot.price * (MOCK_TENANT.settings.upfrontPercent / 100);
        const commission = Math.round(gross * a.commissionRateSnapshot * 100) / 100;
        const credit = Math.round((gross - commission) * 100) / 100;
        return {
          id: `led_${String(i).padStart(3, '0')}`,
          tenantId: a.tenantId,
          transactionId: `pay_${String(i).padStart(3, '0')}`,
          appointmentId: a.id,
          type: 'payment_approved',
          account: 'tenant_balance',
          direction: 'credit',
          amount: credit,
          currency: MOCK_TENANT.currency,
          commissionRateSnapshot: a.commissionRateSnapshot,
          status: 'posted',
          timestamp: a.startTime,
        };
      },
    );
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const confirmedToday = MOCK_APPOINTMENTS.filter(
      (a) => a.status === 'confirmed' && a.startTime >= dayStart.toISOString(),
    ).length;
    return {
      tenant: MOCK_TENANT,
      revenue: movements.reduce((sum, m) => sum + m.amount, 0),
      totalAppointments: MOCK_APPOINTMENTS.length,
      confirmedToday,
      occupancy: Math.min(
        100,
        Math.round(
          (MOCK_APPOINTMENTS.filter((a) => a.startTime >= dayStart.toISOString()).reduce(
            (s, a) => s + a.serviceSnapshot.durationMinutes,
            0,
          ) /
            (3 * 8 * 60)) *
            100,
        ),
      ),
      commission: movements.reduce(
        (s, m) => s + m.amount * ((m.commissionRateSnapshot ?? 0) / (1 - (m.commissionRateSnapshot ?? 0) || 1)),
        0,
      ),
      commissionRate: 0.05,
      upcoming: MOCK_APPOINTMENTS.filter((a) => a.status === 'confirmed').sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      ),
      movements,
      owner: { keycloakUserId: 'kc-owner-001', role: 'owner' },
    };
  }
}