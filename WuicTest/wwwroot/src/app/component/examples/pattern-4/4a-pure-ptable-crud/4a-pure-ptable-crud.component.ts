import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { WtoolboxService } from 'wuic-framework-lib-dev';

interface TaskItem {
  id: number;
  title: string;
  done: boolean;
}

/**
 * Pattern 4 — Full custom / esempio 4a.
 *
 * Pure Angular + PrimeNG. Niente componenti WUIC, niente datasource WUIC,
 * niente metadata. CRUD diretto verso `/api/samples/tasks` (Controller .NET
 * custom, lista in-memory). Dimostra che WUIC non e' un blocco totalitario:
 * puoi convivere con pagine completamente "vanilla" dentro la stessa app.
 *
 * Base URL: letta da `WtoolboxService.appSettings.api_url` (env-driven):
 *   - dev  : 'http://localhost:5000/api/'
 *   - prod : 'http://localhost/api/' (stessa origin via IIS reverse proxy)
 * NON usare URL relative (`/api/samples/tasks`): il dev server Angular
 * :4200 non ha proxy verso :5000 e ritornerebbe un 404 sul dev server.
 */
@Component({
  selector: 'app-4a-pure-ptable-crud',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    TableModule, ButtonModule, InputTextModule, CheckboxModule, DialogModule
  ],
  templateUrl: './4a-pure-ptable-crud.component.html',
  styleUrl: './4a-pure-ptable-crud.component.scss'
})
export class Pattern4aPurePtableCrudComponent implements OnInit {
  private http = inject(HttpClient);

  tasks = signal<TaskItem[]>([]);
  loading = signal(false);
  showDialog = signal(false);
  newTitle = signal('');

  private tasksUrl(id?: number): string {
    const base = `${WtoolboxService.appSettings.api_url}samples/tasks`;
    return id != null ? `${base}/${id}` : base;
  }

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.http.get<TaskItem[]>(this.tasksUrl()).subscribe({
      next: rows => { this.tasks.set(rows); this.loading.set(false); },
      error: _ => { this.tasks.set([]); this.loading.set(false); }
    });
  }

  openAdd(): void {
    this.newTitle.set('');
    this.showDialog.set(true);
  }

  confirmAdd(): void {
    const title = this.newTitle().trim();
    if (!title) return;
    this.http.post<TaskItem>(this.tasksUrl(), { title, done: false })
      .subscribe(_ => { this.showDialog.set(false); this.reload(); });
  }

  toggleDone(row: TaskItem): void {
    this.http.put(this.tasksUrl(row.id), row).subscribe();
  }

  remove(row: TaskItem): void {
    this.http.delete(this.tasksUrl(row.id)).subscribe(_ => this.reload());
  }
}
