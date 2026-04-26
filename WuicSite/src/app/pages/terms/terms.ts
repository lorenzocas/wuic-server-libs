import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-terms',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './terms.html',
  styleUrl: './terms.scss'
})
export class Terms {
  constructor() {
    inject(SeoService).set({ titleKey: 'seo.terms.title', descriptionKey: 'seo.terms.description', path: '/terms' });
  }
}
