import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ConsentService } from '../../services/consent.service';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-cookies',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './cookies.html',
  styleUrl: './cookies.scss'
})
export class Cookies {
  private consent = inject(ConsentService);

  constructor() {
    inject(SeoService).set({ titleKey: 'seo.cookies.title', descriptionKey: 'seo.cookies.description', path: '/cookies' });
  }

  reopenPreferences(): void {
    this.consent.reopen();
  }
}
