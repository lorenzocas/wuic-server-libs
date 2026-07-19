import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { NewsletterSignup } from '../newsletter-signup/newsletter-signup';

@Component({
  selector: 'app-footer',
  imports: [RouterLink, TranslatePipe, NewsletterSignup],
  templateUrl: './footer.html',
  styleUrl: './footer.scss'
})
export class Footer {
  year = new Date().getFullYear();
}
