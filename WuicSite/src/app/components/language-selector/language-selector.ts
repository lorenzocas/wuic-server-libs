import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { LanguageService, SiteLanguage } from '../../services/language.service';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  templateUrl: './language-selector.html',
  styleUrl: './language-selector.scss',
})
export class LanguageSelector {
  private languageService = inject(LanguageService);
  private host = inject(ElementRef<HTMLElement>);

  languages = this.languageService.languages;
  current = this.languageService.current;
  open = signal(false);

  currentLanguage(): SiteLanguage {
    const code = this.current();
    return this.languageService.getLanguageByCode(code) ?? this.languages[0];
  }

  toggle(evt?: MouseEvent): void {
    evt?.stopPropagation();
    this.open.update(v => !v);
  }

  select(lang: SiteLanguage, evt?: MouseEvent): void {
    evt?.stopPropagation();
    this.languageService.setLanguage(lang.code);
    this.open.set(false);
  }

  isActive(lang: SiteLanguage): boolean {
    return this.current() === lang.code;
  }

  /** Close the dropdown when clicking outside the component. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent): void {
    if (!this.open()) return;
    const target = ev.target as Node | null;
    if (target && this.host.nativeElement.contains(target)) return;
    this.open.set(false);
  }

  /** Close on Escape for keyboard users. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open.set(false);
  }
}
