import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, NavigationError, Router, RouterOutlet } from '@angular/router';
import { Navbar } from './components/navbar/navbar';
import { Footer } from './components/footer/footer';
import { CookieBanner } from './components/cookie-banner/cookie-banner';
import { MaintenanceToast } from './core/maintenance-toast';
import { MaintenanceService } from './core/maintenance.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Navbar, Footer, CookieBanner, MaintenanceToast],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly router = inject(Router);
  private readonly maintenance = inject(MaintenanceService);

  /**
   * True when the active route declares `data: { bareLayout: true }` —
   * navbar and footer are hidden. Used by ads landing pages (/start) where
   * every nav link is a leak out of the conversion funnel.
   */
  readonly bareLayout = signal(false);

  constructor() {
    this.router.events.subscribe(ev => {
      if (!(ev instanceof NavigationEnd)) return;
      let route = this.router.routerState.snapshot.root;
      while (route.firstChild) route = route.firstChild;
      this.bareLayout.set(route.data?.['bareLayout'] === true);
    });
    // Watch Router events: when a lazy-loaded chunk fails to load (typically
    // because the IIS maintenance rewrite returned HTML where a .js was
    // expected), the router emits a NavigationError whose error message
    // contains signatures like:
    //   - "Failed to fetch dynamically imported module"
    //   - "Loading chunk X failed"
    //   - "Unexpected token '<'" (SyntaxError from parsing HTML as JS)
    //
    // We treat those as a strong signal that the server is in maintenance
    // and trigger the overlay + reload so the user lands on /maintenance.html.
    this.router.events.subscribe(ev => {
      if (!(ev instanceof NavigationError)) return;
      const msg = String(ev.error?.message ?? ev.error ?? '');
      const chunkLoadFailure =
        /Failed to fetch dynamically imported module/i.test(msg) ||
        /Loading chunk .* failed/i.test(msg) ||
        /error loading dynamically imported module/i.test(msg) ||
        /Unexpected token '?<'?/i.test(msg) ||
        /Importing a module script failed/i.test(msg);
      if (chunkLoadFailure) {
        this.maintenance.trigger('navigation-error');
      }
    });
  }
}
