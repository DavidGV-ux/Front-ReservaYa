import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  BookingService,
  CancelActor,
} from '../../../features/public-portal/services/booking.service';
import { Appointment, Tenant } from '../../models/domain.model';
import { MoneyPipe } from '../../pipes/money.pipe';
import { estimateCancellation } from '../../utils/cancellation-policy';

export interface CancelAppointmentDialogData {
  appointment: Appointment;
  tenant: Tenant | null | undefined;
  by: CancelActor;
}

export const REASON_MAX_LENGTH = 280;

/**
 * Confirma la cancelación mostrando la política del negocio y el reembolso estimado.
 * Cierra con la cita cancelada que devuelve el back, o con `undefined` si el usuario desiste.
 */
@Component({
  selector: 'app-cancel-appointment-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslatePipe,
    MoneyPipe,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'cancel.title' | translate }}</h2>

    <mat-dialog-content class="cancel">
      <div class="cancel__summary">
        <strong>{{ appointment.serviceSnapshot.name }}</strong>
        <span>{{ when() }}</span>
        @if (data.by === 'owner') {
          <span>{{ 'dashboard.client' | translate }}: {{ appointment.clientInfo.name }}</span>
        }
      </div>

      <div class="cancel__policy" [class.cancel__policy--warn]="!estimate.withinWindow" role="note">
        <mat-icon aria-hidden="true">{{ estimate.withinWindow ? 'info' : 'warning' }}</mat-icon>
        <div>
          <p class="cancel__policy-title">{{ 'cancel.policy_title' | translate }}</p>
          <p>{{ policyKey() | translate: { hours: estimate.windowHours } }}</p>
        </div>
      </div>

      <dl class="cancel__refund">
        <div>
          <dt>{{ 'cancel.advance_paid' | translate }}</dt>
          <dd>{{ estimate.advancePaid | appMoney: currency }}</dd>
        </div>
        <div>
          <dt>{{ 'cancel.refund_estimate' | translate }}</dt>
          <dd class="cancel__refund-amount">{{ estimate.refundAmount | appMoney: currency }}</dd>
        </div>
      </dl>
      @if (estimate.advancePaid === 0) {
        <p class="cancel__hint">{{ 'cancel.no_payment' | translate }}</p>
      }

      <mat-form-field appearance="outline" class="cancel__reason">
        <mat-label>{{ 'cancel.reason_label' | translate }}</mat-label>
        <textarea
          matInput
          [formControl]="reason"
          rows="2"
          [maxlength]="reasonMax"
          cdkFocusInitial
        ></textarea>
        <mat-hint align="end">{{ reason.value.length }} / {{ reasonMax }}</mat-hint>
      </mat-form-field>

      @if (errorKey(); as key) {
        <p class="cancel__error" role="alert">
          <mat-icon aria-hidden="true">error</mat-icon>
          {{ key | translate }}
        </p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" [disabled]="submitting()" (click)="close()">
        {{ 'cancel.keep' | translate }}
      </button>
      <button
        mat-flat-button
        type="button"
        class="cancel__confirm"
        [disabled]="submitting() || reason.invalid"
        (click)="confirm()"
      >
        @if (submitting()) {
          <mat-spinner diameter="20" [attr.aria-label]="'common.loading' | translate" />
        } @else {
          {{ 'cancel.confirm' | translate }}
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .cancel {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-width: 380px;
      padding-top: 8px;
    }

    .cancel__summary {
      display: flex;
      flex-direction: column;
      gap: 2px;
      color: var(--mat-sys-on-surface-variant);

      strong {
        color: var(--mat-sys-on-surface);
        font-size: 16px;
      }
    }

    .cancel__policy {
      display: flex;
      gap: 10px;
      padding: 12px;
      border-radius: 12px;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);

      p {
        margin: 0;
        font-size: 13px;
      }
    }

    .cancel__policy--warn {
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
    }

    .cancel__policy-title {
      font-weight: 600;
      margin-bottom: 2px !important;
    }

    .cancel__refund {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin: 0;

      dt {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }

      dd {
        margin: 2px 0 0;
        font-size: 18px;
        font-weight: 600;
      }
    }

    .cancel__refund-amount {
      color: var(--mat-sys-primary);
    }

    .cancel__hint {
      margin: -6px 0 0;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
    }

    .cancel__reason {
      width: 100%;
    }

    .cancel__error {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      color: var(--mat-sys-error);
      font-size: 13px;
    }

    .cancel__confirm {
      background: var(--mat-sys-error);
      color: var(--mat-sys-on-error);
    }

    @media (max-width: 520px) {
      .cancel {
        min-width: 0;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CancelAppointmentDialog {
  protected readonly data = inject<CancelAppointmentDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CancelAppointmentDialog, Appointment>);
  private readonly booking = inject(BookingService);
  private readonly translate = inject(TranslateService);

  protected readonly appointment = this.data.appointment;
  protected readonly currency = this.data.tenant?.currency ?? this.appointment.serviceSnapshot.currency;
  protected readonly estimate = estimateCancellation(this.appointment, this.data.tenant, this.data.by);
  protected readonly reasonMax = REASON_MAX_LENGTH;
  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(REASON_MAX_LENGTH)],
  });

  protected readonly submitting = signal(false);
  protected readonly errorKey = signal<string | null>(null);

  protected readonly policyKey = computed(() => {
    if (this.data.by === 'owner') return 'cancel.policy_owner';
    return this.estimate.withinWindow ? 'cancel.policy_within' : 'cancel.policy_outside';
  });

  protected when(): string {
    const locale = this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
    return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(
      new Date(this.appointment.startTime),
    );
  }

  protected close(): void {
    this.dialogRef.close();
  }

  protected confirm(): void {
    if (this.submitting() || this.reason.invalid) return;
    this.submitting.set(true);
    this.errorKey.set(null);
    this.dialogRef.disableClose = true;

    this.booking.cancel(this.appointment, this.data.by, this.reason.value).subscribe({
      next: (cancelled) => this.dialogRef.close(cancelled),
      error: (err: unknown) => {
        this.submitting.set(false);
        this.dialogRef.disableClose = false;
        this.errorKey.set(cancelErrorKey(err));
      },
    });
  }
}

/** Traduce la respuesta de error del back a una clave de i18n. */
export function cancelErrorKey(err: unknown): string {
  if (!(err instanceof HttpErrorResponse)) return 'cancel.error_generic';
  switch (err.status) {
    case 0:
      return 'cancel.error_network';
    case 401:
    case 403:
      return 'cancel.error_forbidden';
    case 404:
      return 'cancel.error_not_found';
    case 409:
      return 'cancel.error_terminal';
    default:
      return 'cancel.error_generic';
  }
}
