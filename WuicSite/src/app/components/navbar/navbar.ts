import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageSelector } from '../language-selector/language-selector';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive, ButtonModule, LanguageSelector, TranslatePipe],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss'
})
export class Navbar {}
