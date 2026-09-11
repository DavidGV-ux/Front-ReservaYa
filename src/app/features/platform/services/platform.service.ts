import { Injectable, inject } from '@angular/core';
import { map, Observable, of } from 'rxjs';
import { ApiService } from '../../../core/http/api.service';
import { environment } from '../../../core/config/environment';

export interface PlatformTenant {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  country: string;
  currency: 'COP' | 'USD';
  logoUrl?: string;
  coverUrl?: string;
  address?: string;
  servicesCount: number;
  professionalsCount: number;
}

export interface OnboardTenantResult {
  tenant: {
    slug: string;
    tenantId: string;
    name: string;
  };
  identity: { ownerRoleGranted: boolean };
  confirmation: { message: string; nextStep: string };
}

@Injectable({ providedIn: 'root' })
export class PlatformService {
  private readonly api = inject(ApiService);

  directory(): Observable<PlatformTenant[]> {
    if (environment.useMockBackend) {
      return of([
        {
          slug: 'barber-estilo',
          name: 'Barber Estilo',
          tagline: 'Cortes de cabello y barba para caballeros.',
          description: 'Barbería con profesionales certificados.',
          country: 'CO',
          currency: 'COP',
          address: 'Calle 123 #45-67, Bogotá',
          servicesCount: 4,
          professionalsCount: 3,
        },
        {
          slug: 'clinica-vida',
          name: 'Clínica Vida',
          tagline: 'Salud y bienestar para toda la familia.',
          description: 'Consultas médicas y especialistas.',
          country: 'CO',
          currency: 'COP',
          address: 'Av. 68 #10-22, Bogotá',
          servicesCount: 0,
          professionalsCount: 0,
        },
      ]);
    }
    return this.api.get<PlatformTenant[]>('/public/tenants').pipe(
      map((list) =>
        [...list].sort(
          (a, b) =>
            b.servicesCount + b.professionalsCount - (a.servicesCount + a.professionalsCount),
        ),
      ),
    );
  }

  onboardTenant(payload: {
    slug: string;
    name: string;
    tagline?: string;
    description?: string;
    country?: string;
    currency?: 'COP' | 'USD';
    phone?: string;
    address?: string;
    settings?: {
      upfrontPercent?: number;
      cancellationToleranceHours?: number;
    };
  }): Observable<OnboardTenantResult> {
    if (environment.useMockBackend) {
      return of({
        tenant: { slug: payload.slug, tenantId: payload.slug, name: payload.name },
        identity: { ownerRoleGranted: true },
        confirmation: { message: 'ok', nextStep: '/app/owner' },
      });
    }
    return this.api.post<OnboardTenantResult>('/onboarding/tenants', payload);
  }

  inviteProfessional(
    tenantId: string,
    payload: {
      name: string;
      email: string;
      title?: string;
      serviceIds: string[];
      weeklySchedule?: Record<string, Array<{ start: string; end: string }>>;
    },
  ): Observable<{
    professional: { id: string; tenantId: string; name: string; keycloakUserId: string };
    linkedExistingAccount: boolean;
    temporaryPassword?: string;
  }> {
    if (environment.useMockBackend) {
      return of({
        professional: {
          id: `pr_${tenantId}_${payload.email.replace(/[^a-z0-9]/gi, '')}`,
          tenantId,
          name: payload.name,
          keycloakUserId: `kc_${payload.email.replace(/[^a-z0-9]/gi, '')}`,
        },
        linkedExistingAccount: false,
      });
    }
    return this.api.post(`/owner/${tenantId}/professionals/invite`, payload, tenantId);
  }
}