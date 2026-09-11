import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { MOCK_PROFESSIONALS, MOCK_SERVICES } from '../../../../shared/mocks/tenant.mock';
import { Professional } from '../../../../shared/models/domain.model';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import { OWNER_TENANT_KEY } from '../../../platform/pages/business-setup/business-setup.page';
import {
  InviteProfessionalDialog,
  InviteProfessionalDialogData,
} from '../../components/invite-professional-dialog/invite-professional-dialog.component';

@Component({
  selector: 'app-owner-professionals',
  imports: [
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatButtonModule,
    MatDialogModule,
    TranslatePipe,
  ],
  template: `
    <div class="profs">
      <div class="profs__head">
        <h1>{{ 'owner.professionals_title' | translate }}</h1>
        <button mat-flat-button (click)="openInvite()">
          <mat-icon>add</mat-icon>
          {{ 'owner.invite_submit' | translate }}
        </button>
      </div>

      <div class="profs__grid">
        @for (professional of professionals(); track professional.id) {
          <mat-card class="prof">
            <div class="prof__avatar">{{ professional.name.charAt(0) }}</div>
            <h3>{{ professional.name }}</h3>
            <p class="prof__title">{{ professional.title }}</p>

            <mat-chip-set class="prof__chips">
              @for (id of professional.serviceIds; track id) {
                <mat-chip>{{ serviceName(id) }}</mat-chip>
              }
            </mat-chip-set>

            <div class="prof__hours">
              <mat-icon>schedule</mat-icon>
              <span>{{ 'owner.invite_active' | translate }}</span>
            </div>

            <div class="prof__actions">
              <button mat-stroked-button>{{ 'owner.edit' | translate }}</button>
              <button mat-stroked-button>{{ 'owner.schedule' | translate }}</button>
            </div>
          </mat-card>
        } @empty {
          <p class="profs__empty">{{ 'owner.invite_empty' | translate }}</p>
        }
      </div>
    </div>
  `,
  styles: `
    .profs {
      max-width: 1160px;
      margin: 0 auto;
      padding: 32px 20px;
    }

    .profs__head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;

      h1 {
        margin: 0;
        letter-spacing: -0.02em;
      }
    }

    .profs__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
    }

    .prof {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .prof__avatar {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: 22px;
      font-weight: 700;
      color: var(--mat-sys-on-primary-container);
      background: var(--mat-sys-primary-container);
    }

    .prof h3 {
      margin: 4px 0 0;
    }

    .prof__title {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
    }

    .prof__chips {
      margin-top: 4px;
    }

    .prof__hours {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }

    .prof__actions {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .profs__empty {
      grid-column: 1 / -1;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OwnerProfessionalsPage implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly dashboard = inject(DashboardService);

  protected readonly professionals = signal<Professional[]>([]);
  protected readonly serviceCatalog = signal(MOCK_SERVICES);

  protected serviceName(id: string): string {
    return this.serviceCatalog().find((s) => s.id === id)?.name ?? id;
  }

  ngOnInit(): void {
    this.professionals.set(MOCK_PROFESSIONALS);
    this.dashboard.ownerContext().subscribe((membership) => {
      this.reload(membership?.tenantId ?? '');
    });
  }

  protected openInvite(): void {
    const tenantId =
      localStorage.getItem(OWNER_TENANT_KEY) ??
      MOCK_PROFESSIONALS[0]?.tenantId ??
      't_barber_estilo';
    const data: InviteProfessionalDialogData = {
      tenantId,
      services: this.serviceCatalog(),
    };
    this.dialog
      .open(InviteProfessionalDialog, { data, width: '480px' })
      .afterClosed()
      .subscribe((created) => {
        if (!created) return;
        this.reload(tenantId);
      });
  }

  private reload(tenantId: string): void {
    if (!tenantId) return;
    this.dashboard.ownerProfessionals(tenantId).subscribe((list) => this.professionals.set(list));
  }
}