import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * /legal — public-facing legal notices, license summary, third-party
 * attribution. Linked from the site footer. Content is entirely driven by
 * i18n keys under the `legal.*` namespace (see public/assets/i18n/*.json).
 */
@Component({
  selector: 'app-legal',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './legal.html',
  styleUrl: './legal.scss'
})
export class Legal {}
