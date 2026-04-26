import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-privacy',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './privacy.html',
  styleUrl: './privacy.scss'
})
export class Privacy {
  constructor() {
    inject(SeoService).set({ titleKey: 'seo.privacy.title', descriptionKey: 'seo.privacy.description', path: '/privacy' });
  }
}
