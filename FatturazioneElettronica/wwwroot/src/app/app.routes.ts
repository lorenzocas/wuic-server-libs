import { Routes } from '@angular/router';
import { routes as wuicRoutes } from './wuic-bridges/routes';

// Route applicative FatturazioneElettronica.
//
// Tutto il CRUD (clienti, fatture inviate/ricevute, preventivi, ordini,
// ddt, proforma, scadenze, prima_nota, corrispettivi, anagrafiche
// lookup) e' metadata-driven via wuicRoutes — non serve dichiarare
// route Angular esplicite. Il framework risolve dinamicamente
// `#/<route>/list`, `#/<route>/edit/<id>`, `#/<route>/detail/<id>`,
// `#/<route>/report-viewer?reportName=Report.mrt` ecc. dai metadati
// scaffoldati in `_metadati__tabelle` + `_metadati__colonne`.
//
// Qui mettiamo SOLO le route che richiedono UI custom (livello 2+ della
// decision-ladder) o pagine di sistema (error pages, ecc).

export const appRoutes: Routes = [

  // ──────── Custom component livello 2 (FatturazioneElettronica) ────────

  // Block 4 Analytics — REFACTOR FRAMEWORK-FIRST 2026-05-06.
  // I 4 componenti Angular custom (cashflow-forecast / top-clienti /
  // aging-crediti / aging-debiti) sono stati DROPPED in favore di dashboard
  // dom_board.boardroute con boardcontent built da template skill 2x2 +
  // 4 KPI tile bindati via SPAN.bindingFunction + chart archetype framework.
  //
  // Runtime URL boardroute: #/<boardroute>/dashboard
  //   - #/cashflow_forecast/dashboard
  //   - #/top_clienti/dashboard
  //   - #/aging_crediti/dashboard
  //   - #/aging_debiti/dashboard
  //
  // Vedi skill: skills/dashboard-replicate-custom-ui/SKILL.md

  // Bonus B1: Riepilogo IVA periodico (LIPE-style).
  // Aggrega per aliquota su fatture inviate (a debito) + ricevute (a credito)
  // nel periodo (YEAR | Q1..Q4 | 01..12) e calcola il saldo IVA da versare/credito.
  {
    path: 'iva/riepilogo',
    loadComponent: () => import('./component/iva-riepilogo/iva-riepilogo.component')
      .then(m => m.IvaRiepilogoComponent),
    data: {
      breadcrumbs: 'Riepilogo IVA',
      description: 'Aggregato IVA periodico per aliquota: vendite, acquisti, saldo a debito o credito. Filtri per anno e periodo (anno intero, trimestre, mese).'
    }
  },

  // Workflow #21C: Popup riconciliazione movimenti bancari ↔ scadenze.
  // Route invocata automaticamente post-upload movimenti (con ?batch=<id>),
  // o manualmente per ri-fare matching su tutti i movimenti UNMATCHED.
  // Backend: /api/riconciliazione/{suggestions,bulkApply}.
  {
    path: 'riconciliazione/popup',
    loadComponent: () => import('./component/riconciliazione-popup/riconciliazione-popup.component')
      .then(m => m.RiconciliazionePopupComponent),
    data: {
      breadcrumbs: 'Riconciliazione',
      description: 'Popup matching movimenti bancari UNMATCHED a scadenze APERTE. Auto-suggest per importo + data, conferma/skip massivi, applicazione bulk delle riconciliazioni.'
    }
  },

  // Preview HTML stampabile della fattura. Complementa l'export XML SDI
  // (/api/sdi/generateXml) con un layout umano-leggibile per la stampa
  // o l'invio email al cliente. Carica i dati via stored
  // `sp_sdi_get_fattura_payload` esposta da SdiController.
  {
    path: 'fatture_inviate/print/:id',
    loadComponent: () => import('./component/fattura-print/fattura-print.component')
      .then(m => m.FatturaPrintComponent),
    data: {
      breadcrumbs: 'Stampa fattura',
      description: 'Anteprima HTML stampabile della fattura inviata, con layout fiscale italiano. Pulsante stampa nativa browser e download PDF.'
    }
  },

  // Comunicazioni finanziarie (LIPE + esterometro). Form parametrico
  // anno/trimestre/mese collegato a ComunicazioniController.
  // I sotto-mode 'lipe' / 'esterometro' sono distinti via URL hash
  // dal component (entry singolo, due route che mappano lo stesso
  // componente).
  {
    path: 'comunicazioni-finanziarie/lipe',
    loadComponent: () => import('./component/comunicazioni-finanziarie/comunicazioni-finanziarie.component')
      .then(m => m.ComunicazioniFinanziarieComponent),
    data: {
      breadcrumbs: 'LIPE',
      description: 'Liquidazione IVA Periodica trimestrale: aggregato IVA debito/credito + saldo da versare/a credito + export XML AdE.'
    }
  },
  {
    path: 'comunicazioni-finanziarie/esterometro',
    loadComponent: () => import('./component/comunicazioni-finanziarie/comunicazioni-finanziarie.component')
      .then(m => m.ComunicazioniFinanziarieComponent),
    data: {
      breadcrumbs: 'Esterometro',
      description: 'Esterometro mensile: operazioni con controparti estere (clienti+fornitori non IT), riepilogo per periodo.'
    }
  },

  // ──────── Sistema / error pages ────────

  {
    path: 'unauthorized',
    loadComponent: () => import('./component/unauthorized/unauthorized.component')
      .then((m) => m.UnauthorizedComponent),
    data: {
      breadcrumbs: 'unauthorized',
      description: 'Accesso non autorizzato — sessione scaduta o permessi insufficienti. Effettua il login per continuare.'
    }
  },

  // ──────── Route framework metadata-driven (auto-resolve) ────────
  ...wuicRoutes
];

