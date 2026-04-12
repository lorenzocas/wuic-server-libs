import { Component } from '@angular/core';
import { CardModule } from 'primeng/card';
import { AccordionModule } from 'primeng/accordion';

@Component({
  selector: 'app-features',
  imports: [CardModule, AccordionModule],
  templateUrl: './features.html',
  styleUrl: './features.scss'
})
export class Features {
  categories = [
    {
      title: 'Data Layer',
      items: [
        { icon: 'pi pi-database', title: 'DataSource', desc: 'Componente che orchestra lettura dati, filtri, paginazione e ordinamento. Si collega a una route metadata e fornisce i dati ai repeater.' },
        { icon: 'pi pi-list', title: 'DataRepeater', desc: 'Renderizza i dati in archetype visuali: lista, griglia, spreadsheet, kanban, tree, carousel, mappa, calendario, chart.' },
        { icon: 'pi pi-pencil', title: 'CRUD automatico', desc: 'Insert, update, delete generati dai metadata. Validazione, campi required, lookup e suggest configurabili senza codice.' },
        { icon: 'pi pi-filter', title: 'FilterBar', desc: 'Barra filtri dinamica con operatori per tipo colonna, filtro avanzato, ordinamento, raggruppamento e page size.' }
      ]
    },
    {
      title: 'UI Components',
      items: [
        { icon: 'pi pi-objects-column', title: 'Designer', desc: 'Dashboard drag-and-drop runtime: datasource, repeater, chart, template HTML, CSS custom. Salvataggio su DB metadata.' },
        { icon: 'pi pi-th-large', title: 'Field Widgets', desc: 'Libreria di widget per edit form: text, number, date, lookup, upload, code editor, HTML area, dictionary, many-to-many.' },
        { icon: 'pi pi-window-maximize', title: 'Parametric Dialog', desc: 'Dialog parametrica per edit form, wizard multi-step, dettagli record. Tabs, validazione, azioni custom.' },
        { icon: 'pi pi-palette', title: 'Temi e Stili', desc: 'Tema chiaro/scuro, stili condizionali per riga/cella basati su callback JS, CSS custom per board.' }
      ]
    },
    {
      title: 'Business Logic',
      items: [
        { icon: 'pi pi-sitemap', title: 'Workflow Designer', desc: 'Editor visuale di grafi: nodi, condizioni, azioni, trigger. Runner runtime per esecuzione step-by-step.' },
        { icon: 'pi pi-file', title: 'Report Designer', desc: 'Designer integrato Stimulsoft per layout report. Viewer runtime con esportazione PDF, Excel, Word.' },
        { icon: 'pi pi-calendar', title: 'Scheduler', desc: 'Pianificazione task ricorrenti con cron expression, retry, timeout, logging. Hosted service .NET integrato.' },
        { icon: 'pi pi-bell', title: 'Notifiche Realtime', desc: 'WebSocket push per notifiche utente. SqlDependency o polling, bell icon con badge, mark as read.' }
      ]
    },
    {
      title: 'Infrastruttura',
      items: [
        { icon: 'pi pi-cog', title: 'Multi-DBMS', desc: 'SQL Server, MySQL, PostgreSQL, Oracle con provider drop-in. Cambia database con una riga in appsettings.json.' },
        { icon: 'pi pi-shield', title: 'Auth & Sessioni', desc: 'Login cookie-based (client o server-managed), OAuth/OIDC, ruoli, permessi per route, single-session enforcement.' },
        { icon: 'pi pi-comments', title: 'RAG Chatbot', desc: 'Assistente AI che interroga il codebase con indice ibrido BM25 + vector + LoRA cross-encoder. Retrieval + Claude LLM.' },
        { icon: 'pi pi-globe', title: 'Traduzioni', desc: 'Interfaccia multilingua (i18n) + traduzione dati per record/campo. Supporto 5 lingue out-of-the-box.' }
      ]
    }
  ];
}
