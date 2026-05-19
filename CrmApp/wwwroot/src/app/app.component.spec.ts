import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import Aura from '@primeuix/themes/aura';
import { providePrimeNG } from 'primeng/config';

import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideNoopAnimations(),
        providePrimeNG({
          theme: {
            preset: Aura,
            options: {
              darkModeSelector: '.theme-dark'
            }
          }
        })
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'wuic-test' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('wuic-test');
  });

  it('should run change detection without errors', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
