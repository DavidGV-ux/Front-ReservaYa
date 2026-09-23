import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { BookingService } from '../../services/booking.service';
import { TenantService } from '../../services/tenant.service';
import { PortalDataService } from '../../services/portal-data.service';
import {
  CancelAppointmentDialog,
  CancelAppointmentDialogData,
} from '../../../../shared/components/cancel-appointment-dialog/cancel-appointment-dialog.component';
import { Appointment } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { isCancellable } from '../../../../shared/utils/cancellation-policy';

@Component({
  selector: 'app-history-page',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
    TranslatePipe,
    MoneyPipe,
  ],
  template: `
    <div class="history">
      <div class="history__head">
        <h1>{{ 'history.title' | translate }}</h1>
        <p>{{ 'history.subtitle' | translate }}</p>
      </div>

      @if (appointments(); as appointments) {
        @for (appointment of appointments; track appointment.id) {
          <mat-card class="history__item" [class.history__item--cancelled]="appointment.status === 'cancelled'">
            <div class="history__item-main">
              <h3>{{ appointment.serviceSnapshot.name }}</h3>
              <div class="history__item-meta">
                <span>
                  <mat-icon>calendar_today</mat-icon>
                  {{ dateLabel(appointment.startTime) }}
                </span>
                <span>
                  <mat-icon>schedule</mat-icon>
                  {{ timeLabel(appointment.startTime) }} – {{ timeLabel(appointment.endTime) }}
                </span>
                <span>
                  <mat-icon>person</mat-icon>
                  {{ professionalName(appointment.professionalId) }}
                </span>
              </div>
            </div>

            <div class="history__item-side">
              <span class="history__status" [class.history__status--cancelled]="appointment.status === 'cancelled'">
                {{ 'history.status_' + appointment.status | translate }}
              </span>
              <strong>{{ appointment.serviceSnapshot.price | appMoney: tenant()?.currency }}</strong>
              @if (appointment.cancellation; as c) {
                <span class="history__refund">
                  {{ 'cancel.refund_' + c.refundStatus | translate: { amount: (c.refundAmount | appMoney: tenant()?.currency) } }}
                </span>
              }
              @if (canCancel(appointment)) {
                <button
                  mat-stroked-button
                  class="history__cancel"
                  [attr.aria-label]="('history.action_cancel' | translate) + ': ' + appointment.serviceSnapshot.name"
                  (click)="cancel(appointment)"
                >
                  {{ 'history.action_cancel' | translate }}
                </button>
              }
            </div>
          </mat-card>
        } @empty {
          <mat-card class="history__empty">
            <mat-icon>event_available</mat-icon>
            <p>{{ 'history.empty' | translate }}</p>
          </mat-card>
        }
      }

      <p class="history__note">{{ 'history.note' | translate }}</p>
    </div>
  `,
  styles: `
    .history {
      max-width: 820px;
      margin: 0 auto;
      padding: 48px 20px;
    }

    .history__head {
      text-align: center;
      margin-bottom: 28px;

      h1 {
        margin: 0;
        letter-spacing: -0.02em;
      }

      p {
        color: var(--mat-sys-on-surface-variant);
      }
    }

    .history__item {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding: 18px;
      margin-bottom: 12px;
    }

    .history__item--cancelled {
      opacity: 0.6;
    }

    .history__item-main h3 {
      margin: 0 0 8px;
    }

    .history__item-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
    }

    .history__item-meta span {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .history__item-meta mat-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
    }

    .history__item-side {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
    }

    .history__item-side strong {
      font-size: 18px;
    }

    .history__status {
      font-size: 12px;
      font-weight: 600;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
      text-transform: uppercase;
    }

    .history__status--cancelled {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }

    .history__refund {
      max-width: 200px;
      text-align: right;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }

    .history__cancel {
      color: var(--mat-sys-error);
    }

    .history__empty {
      padding: 40px;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }

    .history__empty mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
    }

    .history__note {
      text-align: center;
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPage implements OnInit {
  private readonly tenants = inject(TenantService);
  private readonly booking = inject(BookingService);
  private readonly data = inject(PortalDataService);
  private readonly translate = inject(TranslateService);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);

  protected readonly tenant = this.tenants.currentTenant;
  private readonly appts = signal<Appointment[]>([]);
  protected readonly appointments = this.appts.asReadonly();
  private readonly professionals = signal(new Map<string, string>());

  ngOnInit(): void {
    this.booking.history().subscribe((list) => this.appts.set(list));
    const tenantId = this.tenant()?.tenantId ?? '';
    this.data.professionals(tenantId).subscribe((pros) => {
      this.professionals.set(new Map(pros.map((p) => [p.id, p.name])));
    });
  }

  protected canCancel(appointment: Appointment): boolean {
    return isCancellable(appointment);
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
        this.appts.update((list) => list.map((a) => (a.id === cancelled.id ? cancelled : a)));
        this.snackbar.open(this.translate.instant('history.cancel_done'), 'OK', {
          duration: 4000,
          panelClass: 'app-ok',
        });
      });
  }

  protected professionalName(id: string): string {
    return this.professionals().get(id) ?? '—';
  }

  protected dateLabel(iso: string): string {
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'medium' }).format(new Date(iso));
  }

  protected timeLabel(iso: string): string {
    return new Intl.DateTimeFormat(this.locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  }

  private locale(): string {
    return this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
  }
}