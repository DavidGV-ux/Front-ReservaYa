import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import { BookingService } from '../../../../features/public-portal/services/booking.service';
import { TenantMembership } from '../../../../core/http/api-mappers';
import {
  CancelAppointmentDialog,
  CancelAppointmentDialogData,
} from '../../../../shared/components/cancel-appointment-dialog/cancel-appointment-dialog.component';
import { Appointment } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { estimateCancellation, isCancellable } from '../../../../shared/utils/cancellation-policy';

const TERMINAL = ['cancelled', 'expired', 'completed', 'no_show', 'needs_reassignment'];

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
          <mat-card class="appointment">
            <div class="appointment__main">
              <h3>{{ appointment.serviceSnapshot.name }}</h3>
              <div class="appointment__meta">
                @if (businessName(appointment.tenantId); as biz) {
                  <span>
                    <mat-icon>storefront</mat-icon>
                    {{ biz }}
                  </span>
                }
                <span>
                  <mat-icon>calendar_today</mat-icon>
                  {{ date(appointment.startTime) }}
                </span>
                <span>
                  <mat-icon>schedule</mat-icon>
                  {{ time(appointment.startTime) }} – {{ time(appointment.endTime) }}
                </span>
              </div>
              <div class="appointment__states">
                <span class="appointment__status">
                  {{ 'history.status_' + appointment.status | translate }}
                </span>
                <span class="appointment__pay appointment__pay--{{ appointment.paymentStatus }}">
                  {{ 'history.pay_' + appointment.paymentStatus | translate }}
                </span>
                @if (appointment.paymentReference) {
                  <span class="appointment__ref">
                    <mat-icon>receipt_long</mat-icon>
                    {{ appointment.paymentReference }}
                  </span>
                }
              </div>
            </div>
            <div class="appointment__side">
              <strong>{{ appointment.serviceSnapshot.price | appMoney: appointment.serviceSnapshot.currency }}</strong>
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
            <p>{{ 'dashboard.my_appointments_empty' | translate }}</p>
            <p class="appointments__empty-hint">{{ 'dashboard.my_appointments_empty_hint' | translate }}</p>
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

    .appointment__states {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
      align-items: center;
    }

    .appointment__status,
    .appointment__pay {
      display: inline-block;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      text-transform: uppercase;
    }

    .appointment__status {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }

    .appointment__pay {
      background: var(--mat-sys-surface-variant);
      color: var(--mat-sys-on-surface-variant);

      &--approved {
        background: var(--mat-sys-secondary-container);
        color: var(--mat-sys-on-secondary-container);
      }

      &--pending {
        background: var(--mat-sys-tertiary-container);
        color: var(--mat-sys-on-tertiary-container);
      }

      &--rejected {
        background: var(--mat-sys-error-container);
        color: var(--mat-sys-on-error-container);
      }
    }

    .appointment__ref {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 12px;

      mat-icon {
        font-size: 15px;
        width: 15px;
        height: 15px;
      }
    }

    .appointment__side {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
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

    .appointments__empty-hint {
      margin: 8px 0 0;
      font-size: 13px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientMyAppointmentsPage implements OnInit {
  private readonly dashboard = inject(DashboardService);
  private readonly booking = inject(BookingService);
  private readonly memberships = signal<TenantMembership[]>([]);
  private readonly snackbar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);
  private readonly dialog = inject(MatDialog);

  private readonly upcoming = signal<Appointment[]>([]);
  protected readonly all = this.upcoming.asReadonly();

  ngOnInit(): void {
    this.dashboard.myTenants().subscribe((list) => this.memberships.set(list));
    this.reload();
  }

  private reload(notify = false): void {
    this.dashboard.allAppointments().subscribe({
      next: (list) => {
        const now = Date.now();
        this.upcoming.set(
          this.booking.withMockCancellations(list).filter(
            (a) => !TERMINAL.includes(a.status) && new Date(a.startTime).getTime() >= now,
          ),
        );
        if (notify) {
          void this.translate
            .get('dashboard.cancelled_ok')
            .subscribe((msg) => this.snackbar.open(msg, 'OK', { panelClass: 'app-ok' }));
        }
      },
      error: () => this.upcoming.set([]),
    });
  }

  protected businessName(tenantId: string): string | null {
    return this.memberships().find((m) => m.tenantId === tenantId)?.name ?? null;
  }

  protected canCancel(appointment: Appointment): boolean {
    return isCancellable(appointment);
  }

  /**
   * Fuera del plazo de la política: se puede cancelar, pero sin reembolso.
   * La lista mezcla citas de varios negocios, así que se usa la política por defecto
   * (24 h, 30 % de anticipo); el valor definitivo lo devuelve el back al cancelar.
   */
  protected isLate(appointment: Appointment): boolean {
    return !estimateCancellation(appointment, null, 'client').withinWindow;
  }

  protected cancel(appointment: Appointment): void {
    const data: CancelAppointmentDialogData = { appointment, tenant: null, by: 'client' };
    this.dialog
      .open<CancelAppointmentDialog, CancelAppointmentDialogData, Appointment>(CancelAppointmentDialog, {
        data,
        width: '480px',
        autoFocus: 'dialog',
      })
      .afterClosed()
      .subscribe((cancelled) => {
        if (!cancelled) return;
        // La lista solo muestra citas activas: la cancelada sale de la vista.
        this.upcoming.update((list) => list.filter((a) => a.id !== cancelled.id));
        this.snackbar.open(this.cancelledMessage(cancelled), 'OK', {
          duration: 5000,
          panelClass: 'app-ok',
        });
      });
  }

  /** "Cita cancelada. Reembolso de $X en proceso" según lo que respondió el back. */
  private cancelledMessage(cancelled: Appointment): string {
    const ok = this.translate.instant('dashboard.cancelled_ok');
    const c = cancelled.cancellation;
    if (!c) return ok;
    const amount = new Intl.NumberFormat(this.locale(), {
      style: 'currency',
      currency: cancelled.serviceSnapshot.currency,
      maximumFractionDigits: 0,
    }).format(c.refundAmount);
    return `${ok} ${this.translate.instant('cancel.refund_' + c.refundStatus, { amount })}`;
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