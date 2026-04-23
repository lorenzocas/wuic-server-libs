import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-unauthorized',
  imports: [CommonModule, RouterLink, TranslateModule],
  template: `
    <section class="unauthorized-wrap">
      <h1>{{ 'auth.unauthorized.title' | translate }}</h1>
      <p>{{ 'auth.unauthorized.message' | translate }}</p>
      <p *ngIf="fromRoute" class="from-route">{{ 'auth.unauthorized.requested_route' | translate }} <code>{{ fromRoute }}</code></p>
      <a routerLink="/">{{ 'auth.unauthorized.back_to_home' | translate }}</a>
    </section>
  `,
  styles: [`
    .unauthorized-wrap {
      max-width: 760px;
      margin: 40px auto;
      padding: 22px 20px;
      border: 1px solid #d9e2f3;
      border-radius: 12px;
      background: #fff;
      color: #1d3557;
    }
    .unauthorized-wrap h1 {
      margin: 0 0 10px;
      font-size: 1.7rem;
    }
    .unauthorized-wrap p {
      margin: 0 0 8px;
      line-height: 1.45;
    }
    .unauthorized-wrap .from-route {
      color: #4a6284;
    }
    .unauthorized-wrap a {
      display: inline-block;
      margin-top: 10px;
      text-decoration: none;
      font-weight: 600;
      color: #0d6efd;
    }
  `]
})
export class UnauthorizedComponent {
  readonly fromRoute: string;

  constructor(route: ActivatedRoute) {
    this.fromRoute = String(route.snapshot.queryParamMap.get('from') || '').trim();
  }
}

