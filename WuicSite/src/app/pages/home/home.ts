import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-home',
  imports: [RouterLink, ButtonModule, CardModule],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home {
  features = [
    { icon: 'pi pi-database', title: 'Metadata-Driven', desc: 'Definisci tabelle e colonne nei metadata, il framework genera CRUD, filtri, paginazione e validazione automaticamente.' },
    { icon: 'pi pi-objects-column', title: 'Designer Visuale', desc: 'Dashboard drag-and-drop con datasource, repeater, chart, map, scheduler e template dinamici.' },
    { icon: 'pi pi-sitemap', title: 'Workflow Engine', desc: 'Designer e runner per processi operativi: grafi condizionali, step, azioni custom e trigger automatici.' },
    { icon: 'pi pi-file', title: 'Report Builder', desc: 'Generazione report con designer integrato e viewer runtime, esportazione PDF/Excel.' },
    { icon: 'pi pi-comments', title: 'RAG Chatbot', desc: 'Assistente AI integrato che interroga il codebase in linguaggio naturale con retrieval ibrido + LLM.' },
    { icon: 'pi pi-cog', title: 'Multi-DBMS', desc: 'SQL Server, MySQL, PostgreSQL e Oracle supportati con provider drop-in. Cambia database senza riscrivere codice.' }
  ];
}
