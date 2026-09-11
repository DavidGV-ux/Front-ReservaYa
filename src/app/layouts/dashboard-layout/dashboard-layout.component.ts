import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/auth/auth.service';
import { USER_ROLES, UserRole } from '../../core/auth/roles';
import { LocaleSwitcher } from '../../shared/components/locale-switcher/locale-switcher.component';

interface MenuLink {
  label: string;
  route: string;
  icon: string;
  roles: UserRole[];
}

const ALL_BUSINESS_ROLES = [USER_ROLES.OWNER, USER_ROLES.PROFESSIONAL];

@Component({
  selector: 'app-dashboard-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatMenuModule,
    TranslatePipe,
    LocaleSwitcher,
  ],
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav mode="side" opened class="shell__sidenav">
        <div class="shell__brand">
          <span class="shell__mark">R</span>
          <span class="shell__name">ReservaYa</span>
        </div>
        <mat-nav-list class="shell__menu">
          @for (link of visibleLinks(); track link.route) {
            <a
              mat-list-item
              [routerLink]="link.route"
              routerLinkActive="shell__active"
              [routerLinkActiveOptions]="{ exact: link.route.endsWith('/owner') }"
            >
              <mat-icon matListItemIcon>{{ link.icon }}</mat-icon>
              <span matListItemTitle>{{ link.label | translate }}</span>
            </a>
          }
        </mat-nav-list>

        <div class="shell__footer">
          <button mat-stroked-button class="shell__logout" (click)="logout()">
            <mat-icon>logout</mat-icon>
            <span>{{ 'dashboard.logout' | translate }}</span>
          </button>
        </div>
      </mat-sidenav>

      <mat-sidenav-content class="shell__content">
        <mat-toolbar class="shell__toolbar">
          <span class="shell__role">
            {{ roleLabel() | translate }}
          </span>
          <div class="shell__spacer"></div>
          <app-locale-switcher />
          <button mat-icon-button [matMenuTriggerFor]="userMenu" aria-label="Usuario">
            <mat-icon>account_circle</mat-icon>
          </button>
          <mat-menu #userMenu="matMenu" xPosition="before">
            <button mat-menu-item disabled>
              <mat-icon>person</mat-icon>
              <span>{{ displayName() ?? 'user@reserwaya.io' }}</span>
            </button>
            <button mat-menu-item (click)="logout()">
              <mat-icon>logout</mat-icon>
              <span>{{ 'dashboard.logout' | translate }}</span>
            </button>
          </mat-menu>
        </mat-toolbar>

        <main class="shell__page">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: `
    .shell {
      height: 100vh;
    }

    .shell__sidenav {
      width: 260px;
      display: flex;
      flex-direction: column;
      border-right: 1px solid var(--mat-sys-outline-variant);
    }

    .shell__brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 20px 16px;
    }

    .shell__mark {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
    }

    .shell__name {
      font-weight: 700;
      font-size: 18px;
    }

    .shell__menu {
      flex: 1;
      padding-top: 8px;
    }

    .shell__active {
      background: var(--mat-sys-secondary-container);
    }

    .shell__footer {
      padding: 16px;
    }

    .shell__logout {
      width: 100%;
    }

    .shell__content {
      display: flex;
      flex-direction: column;
    }

    .shell__toolbar {
      position: sticky;
      top: 0;
      z-index: 5;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .shell__role {
      font-weight: 600;
      text-transform: capitalize;
    }

    .shell__spacer {
      flex: 1;
    }

    .shell__page {
      padding: 24px;
      max-width: 1200px;
      width: 100%;
      margin: 0 auto;
      box-sizing: border-box;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardLayout {
  private readonly auth = inject(AuthService);

  protected readonly displayName = computed(() => this.auth.session().name);
  protected readonly visibleLinks = computed<MenuLink[]>(() => {
    const user = this.auth.session();
    return MENU_LINKS.filter((link) =>
      link.roles.some((role) => user.roles.includes(role) || user.roles.includes(USER_ROLES.ADMIN)),
    );
  });
  protected readonly roleLabel = computed(() => {
    const roles = this.auth.session().roles;
    if (roles.includes(USER_ROLES.ADMIN)) return 'dashboard.role_admin';
    if (roles.includes(USER_ROLES.OWNER)) return 'dashboard.role_owner';
    if (roles.includes(USER_ROLES.PROFESSIONAL)) return 'dashboard.role_professional';
    return 'dashboard.role_client';
  });

  constructor() {
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        void this.auth.login().subscribe();
      }
    });
  }

  logout(): void {
    this.auth.logout();
  }
}

const MENU_LINKS: MenuLink[] = [
  {
    label: 'dashboard.menu_overview',
    route: '/app/owner',
    icon: 'dashboard',
    roles: [USER_ROLES.OWNER],
  },
  {
    label: 'dashboard.menu_services',
    route: '/app/owner/services',
    icon: 'content_cut',
    roles: [USER_ROLES.OWNER],
  },
  {
    label: 'dashboard.menu_professionals',
    route: '/app/owner/professionals',
    icon: 'groups',
    roles: [USER_ROLES.OWNER],
  },
  {
    label: 'dashboard.menu_schedule',
    route: '/app/owner',
    icon: 'event_busy',
    roles: [USER_ROLES.OWNER],
  },
  {
    label: 'dashboard.menu_reports',
    route: '/app/owner/reports',
    icon: 'assessment',
    roles: [USER_ROLES.OWNER],
  },
  {
    label: 'dashboard.menu_my_schedule',
    route: '/app/professional',
    icon: 'schedule',
    roles: [USER_ROLES.PROFESSIONAL],
  },
  {
    label: 'dashboard.menu_my_appointments',
    route: '/app/client',
    icon: 'event_note',
    roles: [...ALL_BUSINESS_ROLES, USER_ROLES.CLIENT],
  },
  {
    label: 'dashboard.menu_tenants',
    route: '/app/admin',
    icon: 'storefront',
    roles: [USER_ROLES.ADMIN],
  },
];