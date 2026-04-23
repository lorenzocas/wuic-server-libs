import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ConsentService } from '../../services/consent.service';

@Component({
  selector: 'app-cookies',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './cookies.html',
  styleUrl: './cookies.scss'
})
export class Cookies {
  private consent = inject(ConsentService);

  reopenPreferences(): void {
    this.consent.reopen();
  }
}
