import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { StepperModule } from 'primeng/stepper';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { MessageModule } from 'primeng/message';
import { WtoolboxService } from 'wuic-framework-lib-dev';

interface RegistrationDto {
  fullName: string;
  email: string;
  company: string;
  role: string;
  newsletter: boolean;
}

/**
 * Pattern 4 — Full custom / esempio 4b.
 *
 * Wizard multi-step (3 step) con reactive forms. Ogni step ha la sua
 * validazione; il submit finale POSTa l'oggetto completo a
 * `/api/samples/registrations` (Controller .NET custom in WuicTest).
 *
 * Mostra che pattern complessi (multi-step + validazione + reactive state)
 * sono perfettamente fattibili senza alcun componente WUIC: stack standard
 * Angular + PrimeNG + HttpClient.
 */
@Component({
  selector: 'app-4b-pure-form-wizard',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    StepperModule, ButtonModule, InputTextModule, CardModule, MessageModule
  ],
  templateUrl: './4b-pure-form-wizard.component.html',
  styleUrl: './4b-pure-form-wizard.component.scss'
})
export class Pattern4bPureFormWizardComponent {
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);

  // Step 1: dati personali
  personalForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]]
  });

  // Step 2: dati azienda
  companyForm: FormGroup = this.fb.group({
    company: ['', Validators.required],
    role: ['', Validators.required]
  });

  // Step 3: preferenze
  preferencesForm: FormGroup = this.fb.group({
    newsletter: [true]
  });

  submitting = signal(false);
  result = signal<{ id: number } | null>(null);
  errorMsg = signal<string>('');

  submit(): void {
    const payload: RegistrationDto = {
      ...this.personalForm.value,
      ...this.companyForm.value,
      ...this.preferencesForm.value
    } as RegistrationDto;

    this.submitting.set(true);
    this.errorMsg.set('');
    // Env-driven base URL (stessa pattern di 3b/4a): dev='http://localhost:5000/api/',
    // prod='http://localhost/api/' via IIS reverse proxy. URL relative NON
    // funzionano in dev perche' il dev server Angular :4200 non ha proxy :5000.
    const apiUrl = `${WtoolboxService.appSettings.api_url}samples/registrations`;
    this.http.post<{ id: number }>(apiUrl, payload).subscribe({
      next: res => { this.result.set(res); this.submitting.set(false); },
      error: err => {
        this.errorMsg.set(err?.message || 'Submit failed');
        this.submitting.set(false);
      }
    });
  }

  reset(): void {
    this.personalForm.reset();
    this.companyForm.reset();
    this.preferencesForm.reset({ newsletter: true });
    this.result.set(null);
    this.errorMsg.set('');
  }
}
