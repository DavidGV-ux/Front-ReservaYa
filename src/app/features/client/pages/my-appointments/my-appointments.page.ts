import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import { BookingService } from '../../../../features/public-portal/services/booking.service';
import { TenantService } from '../../../../features/public-portal/services/tenant.service';
import {
  CancelAppointmentDialog,
  CancelAppointmentDialogData,
} from '../../../../shared/components/cancel-appointment-dialog/cancel-appointment-dialog.component';
import { Appointment } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { estimateCancellation, isCancellable } from '../../../../shared/utils/cancellation-policy';

@Component({
  selector: 'app-client-my-appointments',
  imports: [
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatDialogModule,
    MatSnackBarModule,
    TranslatePipe,
    MoneyPipe,
  ],
  template: `
    <div class="appointments">
      <div class="appointments__head">
        <h1>{{ 'dashboard.my_appointments' | translate }}</h1>
        <p>{{ 'dashboard.my_appointments_hint' | translate }}</p>
      </div>

      <div class="appointments__list">
        @for (appointment of all(); track appointment.id) {
          <mat-card class="appointment" [class.appointment--cancelled]="appointment.status === 'cancelled'">
            <div class="appointment__main">
              <h3>{{ appointment.serviceSnapshot.name }}</h3>
              <div class="appointment__meta">
                <span>
                  <mat-icon>calendar_today</mat-icon>
                  {{ date(appointment.startTime) }}
                </span>
                <span>
                  <mat-icon>schedule</mat-icon>
                  {{ time(appointment.startTime) }} – {{ time(appointment.endTime) }}
                </span>
              </div>
              <span class="appointment__status" [class.appointment__status--cancelled]="appointment.status === 'cancelled'">
                {{ 'history.status_' + appointment.status | translate }}
              </span>
              @if (appointment.cancellation; as c) {
                <p class="appointment__refund">
                  {{ 'cancel.refund_' + c.refundStatus | translate: { amount: (c.refundAmount | appMoney: tenant()?.currency) } }}
                </p>
              }
            </div>
            <div class="appointment__side">
              <strong>{{ appointment.serviceSnapshot.price | appMoney: tenant()?.currency }}</strong>
              @if (canCancel(appointment)) {
                <button
                  mat-stroked-button
                  class="appointment__cancel"
                  [attr.aria-label]="('dashboard.cancel' | translate) + ': ' + appointment.serviceSnapshot.name"
                  (click)="cancel(appointment)"
                >
                  {{ 'dashboard.cancel' | translate }}
                </button>
                @if (isLate(appointment)) {
                  <span class="appointment__late">{{ 'cancel.late_hint' | translate }}</span>
                }
              }
            </div>
          </mat-card>
        } @empty {
          <mat-card class="appointments__empty">
            <mat-icon>event_available</mat-icon>
            <p>{{ 'history.empty' | translate }}</p>
          </mat-card>
        }
      </div>
    </div>
  `,
  styles: `
    .appointments {
      max-width: 900px;
      margin: 0 auto;
      padding: 32px 20px;
    }

    .appointments__head {
      margin-bottom: 20px;

      h1 {
        margin: 0;
        letter-spacing: -0.02em;
      }

      p {
        margin: 4px 0 0;
        color: var(--mat-sys-on-surface-variant);
      }
    }

    .appointments__list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .appointment {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 18px;
    }

    .appointment--cancelled {
      opacity: 0.6;
    }

    .appointment__main h3 {
      margin: 0 0 8px;
    }

    .appointment__meta {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
    }

    .appointment__meta span {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .appointment__meta mat-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
    }

    .appointment__status {
      display: inline-block;
      margin-top: 8px;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
      text-transform: uppercase;
    }

    .appointment__status--cancelled {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }

    .appointment__side {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
    }

    .appointment__refund {
      margin: 6px 0 0;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }

    .appointment__cancel {
      color: var(--mat-sys-error);
    }

    .appointment__late {
      max-width: 180px;
      text-align: right;
      font-size: 11px;
      color: var(--mat-sys-error);
    }

    .appointments__empty {
      padding: 40px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientMyAppointmentsPage implements OnInit {
  private readonly dashboard = inject(DashboardService);
  private readonly booking = inject(BookingService);
  private readonly tenants = inject(TenantService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);
  private readonly dialog = inject(MatDialog);

  protected readonly tenant = this.tenants.currentTenant;
  private readonly session = signal<Appointment[]>([]);

  protected readonly all = this.session.asReadonly();

  ngOnInit(): void {
    this.reload();
  }

  protected canCancel(appointment: Appointment): boolean {
    return isCancellable(appointment);
  }

  /** Fuera del plazo de la política: se puede cancelar, pero sin reembolso. */
  protected isLate(appointment: Appointment): boolean {
    return !estimateCancellation(appointment, this.tenant(), 'client').withinWindow;
  }

  protected cancel(appointment: Appointment): void {
    const data: CancelAppointmentDialogData = { appointment, tenant: this.tenant(), by: 'client' };
    this.dialog
      .open<CancelAppointmentDialog, CancelAppointmentDialogData, Appointment>(CancelAppointmentDialog, {
        data,
        width: '480px',
        autoFocus: 'dialog',
      })
      .afterClosed()
      .subscribe((cancelled) => {
        if (!cancelled) return;
        this.session.update((list) => list.map((a) => (a.id === cancelled.id ? cancelled : a)));
        this.snackbar.open(this.translate.instant('dashboard.cancelled_ok'), 'OK', {
          duration: 4000,
          panelClass: 'app-ok',
        });
      });
  }

  private reload(): void {
    this.dashboard.roleContext('client').subscribe((membership) => {
      if (!membership) {
        this.session.set([]);
        return;
      }
      this.tenants.resolve(membership.slug).subscribe({
        next: () => undefined,
        error: () => undefined,
      });
      this.dashboard.clientAppointments(membership.tenantId).subscribe({
        next: (list) => this.session.set(this.booking.withMockCancellations(list)),
        error: () => this.session.set([]),
      });
    });
  }

  protected date(iso: string): string {
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'medium' }).format(new Date(iso));
  }

  protected time(iso: string): string {
    return new Intl.DateTimeFormat(this.locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  }

  private locale(): string {
    return this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
  }
}