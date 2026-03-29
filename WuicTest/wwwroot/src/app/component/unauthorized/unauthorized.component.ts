import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-unauthorized',
  imports: [CommonModule, RouterLink],
  template: `
    <section class="unauthorized-wrap">
      <h1>Accesso negato</h1>
      <p>Non hai i permessi necessari per aprire questa pagina.</p>
      <p *ngIf="fromRoute" class="from-route">Route richiesta: <code>{{ fromRoute }}</code></p>
      <a routerLink="/">Torna alla home</a>
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

