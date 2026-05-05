import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { FieldsetModule } from 'primeng/fieldset';

import { GlobalHandler } from '../../handler/GlobalHandler';
import { CustomException } from '../../class/customException';

/**
 * Reusable WUIC error dialog (skill crash-reporting Commit 9b — Opzione B).
 *
 * Si auto-sottoscrive a <c>GlobalHandler.messageNotification</c> e renderizza
 * il `CustomException` corrente. Sostituisce il template duplicato che vive
 * tra i consumer (WuicTest, CrmApp): basta dropparlo nel template della
 * shell con `<wuic-error-dialog />` e il dialog appare in automatico ogni
 * volta che `GlobalHandler.handleError` produce un evento.
 *
 * ── Layout ─────────────────────────────────────────────────────────────
 * - Header: `currentException.title` (gia' tradotto da `tryTranslate` /
 *   `buildTypedException` lato GlobalHandler).
 * - Body principale:
 *    - `kind === 'sql-passthrough'` → body raw SQL + sqlDetails meta-line.
 *    - default → title text + (se presenti) `parserMessage`, `lineNumber`,
 *      `linePosition`, `route` da args dell'envelope tipizzato.
 * - Sezioni espandibili (collapsed by default):
 *    - Executed query (solo SQL)
 *    - Parameters (solo SQL)
 *    - Stack trace (per qualsiasi exception non vuota)
 * - traceId in fondo se presente.
 * - Footer: bottone "Copia" (clipboard JSON-like) + "OK" che chiude.
 *
 * ── Esposizione test ───────────────────────────────────────────────────
 * `(window as any).__wuicLastDialogException` viene scritto al next() della
 * subscription, cosi' i test e2e possono asserire shape senza DOM scraping.
 */
@Component({
  selector: 'wuic-error-dialog',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    DialogModule,
    ButtonModule,
    FieldsetModule,
  ],
  templateUrl: './error-dialog.component.html',
  styleUrl: './error-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WuicErrorDialogComponent implements OnInit, OnDestroy {
  visible = false;
  currentException: CustomException | null = null;

  private sub?: Subscription;

  constructor(private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.sub = GlobalHandler.messageNotification.subscribe((data: any) => {
      this.currentException = data?.exception ?? null;
      this.visible = !!data?.show;
      try { (window as any).__wuicLastDialogException = data?.exception; } catch { /* noop */ }
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    try { this.sub?.unsubscribe(); } catch { /* noop */ }
  }

  // ── Helper di formato ─────────────────────────────────────────────────

  formatParameters(params: Record<string, unknown> | undefined | null): string {
    if (!params || typeof params !== 'object') return '';
    try {
      return Object.entries(params)
        .map(([k, v]) => `${k} = ${JSON.stringify(v)}`)
        .join('\n');
    } catch {
      return '';
    }
  }

  formatSqlDetails(d: any): string {
    if (!d) return '';
    const parts: string[] = [];
    if (d.number !== undefined && d.number !== null) parts.push(`Number: ${d.number}`);
    if (d.state !== undefined && d.state !== null) parts.push(`State: ${d.state}`);
    if (d.class !== undefined && d.class !== null) parts.push(`Class: ${d.class}`);
    if (d.line !== undefined && d.line !== null) parts.push(`Line: ${d.line}`);
    if (d.procedure) parts.push(`Procedure: ${d.procedure}`);
    if (d.server)    parts.push(`Server: ${d.server}`);
    if (d.database)  parts.push(`DB: ${d.database}`);
    return parts.join('  ·  ');
  }

  /**
   * Copia un blob testuale self-contained con tutti i dettagli che servono
   * per aprire un ticket / chat con il DBA: title, body, sqlDetails, query,
   * parameters, stack, traceId.
   */
  copyErrorDetails(): void {
    const e: any = this.currentException;
    if (!e) return;
    const sections: string[] = [];
    if (e.title)      sections.push(`# ${e.title}`);
    if (e.body)       sections.push(e.body);
    const det = this.formatSqlDetails(e.sqlDetails);
    if (det)          sections.push(det);
    if (e.query)      sections.push('-- Query --\n' + e.query);
    const pars = this.formatParameters(e.parameters);
    if (pars)         sections.push('-- Parameters --\n' + pars);
    if (e.stackTrace) sections.push('-- Stack --\n' + e.stackTrace);
    if (e.traceId)    sections.push(`traceId: ${e.traceId}`);
    const text = sections.join('\n\n');
    try { navigator?.clipboard?.writeText(text); } catch { /* clipboard unavailable */ }
  }

  onClose(): void {
    this.visible = false;
  }
}
