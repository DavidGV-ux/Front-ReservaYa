import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DashboardService } from '../../../dashboard/services/dashboard.service';
import { LedgerEntry } from '../../../../shared/models/domain.model';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import {
  dayKey,
  isCommission,
  isIncome,
  isRefund,
  OwnerReport,
} from '../../../../shared/utils/owner-report';

type Preset = '7d' | '30d' | 'month' | 'custom';

const MAX_RANGE_DAYS = 366;

@Component({
  selector: 'app-owner-reports',
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatTableModule,
    TranslatePipe,
    MoneyPipe,
  ],
  template: `
    <div class="reports">
      <div class="reports__head">
        <div>
          <h1>{{ 'reports.title' | translate }}</h1>
          <p>{{ 'reports.subtitle' | translate }}</p>
        </div>
      </div>

      <mat-card class="filters">
        <mat-button-toggle-group
          [value]="preset()"
          (change)="applyPreset($event.value)"
          [attr.aria-label]="'reports.range' | translate"
        >
          <mat-button-toggle value="7d">{{ 'reports.last_7' | translate }}</mat-button-toggle>
          <mat-button-toggle value="30d">{{ 'reports.last_30' | translate }}</mat-button-toggle>
          <mat-button-toggle value="month">{{ 'reports.this_month' | translate }}</mat-button-toggle>
        </mat-button-toggle-group>

        <form class="filters__custom" (ngSubmit)="applyCustom()">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'reports.from' | translate }}</mat-label>
            <input matInput type="date" name="from" [(ngModel)]="fromInput" [max]="toInput" required />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'reports.to' | translate }}</mat-label>
            <input matInput type="date" name="to" [(ngModel)]="toInput" [min]="fromInput" required />
          </mat-form-field>
          <button mat-flat-button type="submit">{{ 'reports.apply' | translate }}</button>
        </form>

        @if (rangeError(); as key) {
          <p class="filters__error" role="alert">{{ key | translate: { days: maxRangeDays } }}</p>
        }
      </mat-card>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" [attr.aria-label]="'common.loading' | translate" />
      }

      @if (loadError()) {
        <mat-card class="reports__state reports__state--error" role="alert">
          <mat-icon aria-hidden="true">cloud_off</mat-icon>
          <p>{{ 'reports.error' | translate }}</p>
          <button mat-stroked-button (click)="load()">{{ 'reports.retry' | translate }}</button>
        </mat-card>
      } @else if (report(); as r) {
        @if (r.partial) {
          <p class="reports__partial" role="note">
            <mat-icon aria-hidden="true">info</mat-icon>
            {{ 'reports.partial_note' | translate }}
          </p>
        }

        <div class="metrics">
          <mat-card class="metric">
            <span class="metric__label">{{ 'reports.income' | translate }}</span>
            <strong class="metric__value">{{ r.income | appMoney: r.currency }}</strong>
            <span class="metric__hint">{{ r.paymentsCount }} {{ 'reports.payments' | translate }}</span>
          </mat-card>
          <mat-card class="metric">
            <span class="metric__label">{{ 'reports.commission' | translate }}</span>
            <strong class="metric__value">{{ r.commission | appMoney: r.currency }}</strong>
            <span class="metric__hint">{{ 'reports.commission_hint' | translate }}</span>
          </mat-card>
          <mat-card class="metric">
            <span class="metric__label">{{ 'reports.refunds' | translate }}</span>
            <strong class="metric__value">{{ r.refunds | appMoney: r.currency }}</strong>
            <span class="metric__hint">{{ 'reports.refunds_hint' | translate }}</span>
          </mat-card>
          <mat-card class="metric metric--accent">
            <span class="metric__label">{{ 'reports.net' | translate }}</span>
            <strong class="metric__value">{{ r.net | appMoney: r.currency }}</strong>
            <span class="metric__hint">{{ 'reports.net_hint' | translate }}</span>
          </mat-card>
        </div>

        @if (r.appointments; as a) {
          <mat-card class="panel">
            <h2>{{ 'reports.appointments' | translate }}</h2>
            <dl class="stats">
              <div><dt>{{ 'reports.total' | translate }}</dt><dd>{{ a.total }}</dd></div>
              <div><dt>{{ 'history.status_confirmed' | translate }}</dt><dd>{{ a.confirmed }}</dd></div>
              <div><dt>{{ 'history.status_completed' | translate }}</dt><dd>{{ a.completed }}</dd></div>
              <div><dt>{{ 'history.status_cancelled' | translate }}</dt><dd>{{ a.cancelled }}</dd></div>
              <div><dt>{{ 'history.status_no_show' | translate }}</dt><dd>{{ a.noShow }}</dd></div>
            </dl>
          </mat-card>
        }

        <mat-card class="panel">
          <h2 id="daily-title">{{ 'reports.daily' | translate }}</h2>
          @if (r.paymentsCount === 0) {
            <p class="panel__empty">{{ 'reports.empty' | translate }}</p>
          } @else {
            <div class="chart" role="img" [attr.aria-label]="chartLabel()">
              @for (day of r.daily; track day.date) {
                <div class="chart__col" [title]="dayLabel(day.date) + ' · ' + (day.income | appMoney: r.currency)">
                  <div class="chart__bar" [style.height.%]="barHeight(day.income)"></div>
                  @if (showDayTick(day.date, $index)) {
                    <span class="chart__tick">{{ shortDay(day.date) }}</span>
                  }
                </div>
              }
            </div>
          }
        </mat-card>

        <mat-card class="panel">
          <h2>{{ 'reports.movements' | translate }}</h2>
          @if (r.movements.length === 0) {
            <p class="panel__empty">{{ 'reports.empty' | translate }}</p>
          } @else {
            <div class="panel__scroll">
              <table mat-table [dataSource]="r.movements" class="panel__table">
                <ng-container matColumnDef="date">
                  <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.date' | translate }}</th>
                  <td mat-cell *matCellDef="let m">{{ compactDate(m.timestamp) }}</td>
                </ng-container>
                <ng-container matColumnDef="type">
                  <th mat-header-cell *matHeaderCellDef>{{ 'reports.type' | translate }}</th>
                  <td mat-cell *matCellDef="let m">{{ typeKey(m) | translate }}</td>
                </ng-container>
                <ng-container matColumnDef="ref">
                  <th mat-header-cell *matHeaderCellDef>{{ 'dashboard.reference' | translate }}</th>
                  <td mat-cell *matCellDef="let m" class="panel__mono">{{ m.transactionId }}</td>
                </ng-container>
                <ng-container matColumnDef="amount">
                  <th mat-header-cell *matHeaderCellDef class="panel__num">{{ 'dashboard.amount' | translate }}</th>
                  <td mat-cell *matCellDef="let m" class="panel__num" [class.panel__debit]="m.direction === 'debit'">
                    {{ m.direction === 'debit' ? '−' : '+' }} {{ m.amount | appMoney: m.currency }}
                  </td>
                </ng-container>
                <tr mat-header-row *matHeaderRowDef="cols"></tr>
                <tr mat-row *matRowDef="let row; columns: cols"></tr>
              </table>
            </div>
          }
        </mat-card>
      }
    </div>
  `,
  styles: `
    .reports {
      max-width: 1160px;
      margin: 0 auto;
      padding: 32px 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .reports__head {
      h1 {
        margin: 0;
        letter-spacing: -0.02em;
      }

      p {
        margin: 4px 0 0;
        color: var(--mat-sys-on-surface-variant);
      }
    }

    .filters {
      padding: 16px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .filters__custom {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }

    .filters__error {
      width: 100%;
      margin: 0;
      color: var(--mat-sys-error);
      font-size: 13px;
    }

    .reports__partial {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 10px 14px;
      border-radius: 12px;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      font-size: 13px;
    }

    .reports__state {
      padding: 32px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      text-align: center;
    }

    .reports__state--error mat-icon {
      color: var(--mat-sys-error);
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }

    .metric {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .metric--accent {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }

    .metric__label {
      font-size: 13px;
      opacity: 0.8;
    }

    .metric__value {
      font-size: 26px;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }

    .metric__hint {
      font-size: 12px;
      opacity: 0.75;
    }

    .panel {
      padding: 16px;

      h2 {
        margin: 0 0 12px;
        font-size: 18px;
      }
    }

    .panel__empty {
      margin: 8px 0;
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
      font-size: 13px;
    }

    .panel__scroll {
      overflow-x: auto;
    }

    .panel__table {
      width: 100%;
    }

    .panel__mono,
    .panel__num {
      font-variant-numeric: tabular-nums;
    }

    .panel__num {
      text-align: right;
    }

    .panel__debit {
      color: var(--mat-sys-error);
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 12px;
      margin: 0;

      dt {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }

      dd {
        margin: 2px 0 0;
        font-size: 22px;
        font-weight: 600;
      }
    }

    .chart {
      display: flex;
      align-items: flex-end;
      gap: 3px;
      height: 180px;
      padding-bottom: 20px;
    }

    .chart__col {
      position: relative;
      flex: 1;
      height: 100%;
      display: flex;
      align-items: flex-end;
    }

    .chart__bar {
      width: 100%;
      min-height: 2px;
      border-radius: 4px 4px 0 0;
      background: var(--mat-sys-primary);
    }

    .chart__tick {
      position: absolute;
      bottom: -20px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 11px;
      white-space: nowrap;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OwnerReportsPage implements OnInit {
  private readonly dashboard = inject(DashboardService);
  private readonly translate = inject(TranslateService);

  protected readonly cols = ['date', 'type', 'ref', 'amount'];
  protected readonly maxRangeDays = MAX_RANGE_DAYS;

  protected readonly preset = signal<Preset>('30d');
  protected readonly report = signal<OwnerReport | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly rangeError = signal<string | null>(null);

  protected fromInput = '';
  protected toInput = '';
  private tenantId: string | null = null;

  private readonly maxIncome = computed(() =>
    Math.max(0, ...(this.report()?.daily.map((d) => d.income) ?? [0])),
  );

  ngOnInit(): void {
    this.setPresetDates('30d');
    this.dashboard.ownerContext().subscribe((membership) => {
      this.tenantId = membership?.tenantId ?? null;
      this.load();
    });
  }

  protected applyPreset(preset: Preset): void {
    this.setPresetDates(preset);
    this.load();
  }

  protected applyCustom(): void {
    this.preset.set('custom');
    this.load();
  }

  load(): void {
    const range = this.parseRange();
    if (!range || !this.tenantId) return;
    this.loading.set(true);
    this.loadError.set(false);
    this.dashboard.ownerReport(this.tenantId, range.from, range.to).subscribe({
      next: (r) => {
        this.report.set(r);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  protected barHeight(value: number): number {
    const max = this.maxIncome();
    return max > 0 ? (value / max) * 100 : 0;
  }

  /** Muestra etiquetas espaciadas para que no se amontonen en rangos largos. */
  protected showDayTick(date: string, index: number): boolean {
    const total = this.report()?.daily.length ?? 0;
    const step = Math.max(1, Math.ceil(total / 8));
    return index % step === 0;
  }

  protected chartLabel(): string {
    const r = this.report();
    if (!r) return '';
    const best = r.daily.reduce((a, b) => (b.income > a.income ? b : a), r.daily[0]);
    return this.translate.instant('reports.chart_label', {
      days: r.daily.length,
      best: best ? this.dayLabel(best.date) : '—',
    });
  }

  protected typeKey(m: LedgerEntry): string {
    if (isIncome(m)) return 'reports.type_income';
    if (isCommission(m)) return 'reports.type_commission';
    if (isRefund(m)) return 'reports.type_refund';
    return 'reports.type_other';
  }

  protected compactDate(iso: string): string {
    return new Intl.DateTimeFormat(this.locale(), {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  }

  protected dayLabel(key: string): string {
    return new Intl.DateTimeFormat(this.locale(), { dateStyle: 'medium' }).format(this.fromKey(key));
  }

  protected shortDay(key: string): string {
    return new Intl.DateTimeFormat(this.locale(), { day: '2-digit', month: 'short' }).format(this.fromKey(key));
  }

  private setPresetDates(preset: Preset): void {
    const today = new Date();
    const from = new Date(today);
    if (preset === '7d') from.setDate(today.getDate() - 6);
    else if (preset === 'month') from.setDate(1);
    else from.setDate(today.getDate() - 29);
    this.preset.set(preset);
    this.fromInput = dayKey(from);
    this.toInput = dayKey(today);
  }

  private parseRange(): { from: Date; to: Date } | null {
    this.rangeError.set(null);
    if (!this.fromInput || !this.toInput) {
      this.rangeError.set('reports.error_required');
      return null;
    }
    const from = this.fromKey(this.fromInput);
    const to = this.fromKey(this.toInput);
    to.setHours(23, 59, 59, 999);
    if (from > to) {
      this.rangeError.set('reports.error_order');
      return null;
    }
    if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS) {
      this.rangeError.set('reports.error_too_long');
      return null;
    }
    return { from, to };
  }

  /** Convierte YYYY-MM-DD a fecha local (new Date('YYYY-MM-DD') la tomaría en UTC). */
  private fromKey(key: string): Date {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private locale(): string {
    return this.translate.getCurrentLang() === 'en' ? 'en-US' : 'es-CO';
  }
}
