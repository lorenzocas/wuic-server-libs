import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Pattern 1 — Full autogeneration / esempio 1b.
 *
 * Stesso pattern di 1a ma con DUE dimensioni cambiate:
 *   - route slug: `customers` invece di `cities`
 *   - archetype: `spreadsheet` invece del default `list`
 *
 * Mostra che cambiare entity + UX paradigm e' una variazione di metadata,
 * non di codice. Lo stesso wrapper minimale di 1a vale qui.
 */
@Component({
  selector: 'app-1b-customers-spreadsheet-autogen',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './1b-customers-spreadsheet-autogen.component.html',
  styleUrl: './1b-customers-spreadsheet-autogen.component.scss'
})
export class Pattern1bCustomersSpreadsheetAutogenComponent {}
