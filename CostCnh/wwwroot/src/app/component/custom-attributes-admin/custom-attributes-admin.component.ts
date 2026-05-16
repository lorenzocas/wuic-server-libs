import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectModule } from 'primeng/select';
import { MessageModule } from 'primeng/message';
import { DialogModule } from 'primeng/dialog';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import {
  CustomAttributesService,
  CustomAttributeDefinition,
  CustomLookupOption,
} from 'wuic-framework-lib';

/**
 * Phase I.7 — Custom Attributes admin manager.
 *
 * UI app-local in CostCnh per gestire definizioni (`core.custom_attribute`),
 * lookup options (`core.custom_lookup`) e mappings (`core.custom_attribute_mapping`).
 *
 * Layout:
 *   - Tab "Definitions" : list per context (program/project/resource/scenario/xbs_node)
 *                         + create/edit dialog
 *   - Tab "Lookup Options" : per ogni attribute con has_lookup=1, gestisci le opzioni
 *
 * Mappings advanced (per Site/ProjectClass) deferred a iterazione successiva.
 */
@Component({
  selector: 'costcnh-custom-attributes-admin',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonModule, InputTextModule, TableModule, TabsModule,
    CheckboxModule, SelectModule, MessageModule, DialogModule, ProgressSpinnerModule, TooltipModule,
  ],
  template: `
    <div class="ca-admin">
      <h2><i class="pi pi-cog"></i> Custom Attributes Admin</h2>

      <p-tabs [(value)]="activeTab">
        <p-tablist>
          <p-tab value="definitions">Definitions</p-tab>
          <p-tab value="lookups">Lookup Options</p-tab>
        </p-tablist>
        <p-tabpanels>

          <!-- ─── Tab Definitions ────────────────────────────────────────────── -->
          <p-tabpanel value="definitions">
            <div class="ca-toolbar">
              <label>Context:</label>
              <p-select [(ngModel)]="contextFilter" [options]="contexts" optionLabel="label" optionValue="value"
                        (onChange)="loadDefinitions()"></p-select>
              <button pButton icon="pi pi-plus" label="New Attribute" (click)="openCreate()"></button>
            </div>

            <p-table [value]="definitions" [paginator]="true" [rows]="20" responsiveLayout="scroll">
              <ng-template pTemplate="header">
                <tr>
                  <th>Context</th><th>Code</th><th>Label</th><th>Type</th>
                  <th>Multi</th><th>Lookup</th><th>Required</th><th>Order</th>
                  <th>Actions</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-d>
                <tr>
                  <td>{{d.context}}</td>
                  <td><code>{{d.code}}</code></td>
                  <td>{{d.display_name}}</td>
                  <td><span class="ca-type ca-type-{{d.value_type}}">{{d.value_type}}</span></td>
                  <td>{{d.allow_multiple ? '✓' : ''}}</td>
                  <td>{{d.has_lookup ? '✓' : ''}}</td>
                  <td>{{d.is_required ? '✓' : ''}}</td>
                  <td>{{d.edit_order}}</td>
                  <td>
                    <button pButton icon="pi pi-list" *ngIf="d.has_lookup" (click)="loadLookupFor(d)" pTooltip="Manage lookup"></button>
                  </td>
                </tr>
              </ng-template>
            </p-table>
          </p-tabpanel>

          <!-- ─── Tab Lookup Options ────────────────────────────────────────── -->
          <p-tabpanel value="lookups">
            <ng-container *ngIf="lookupAttribute; else lookupPick">
              <h3>Lookup options for: <code>{{lookupAttribute.code}}</code></h3>
              <button pButton icon="pi pi-plus" label="Add option" (click)="openCreateLookupOption()"></button>
              <p-table [value]="lookupOptions" [paginator]="false">
                <ng-template pTemplate="header">
                  <tr><th>Code</th><th>Value</th><th>Description</th><th>Sort</th><th>Active</th></tr>
                </ng-template>
                <ng-template pTemplate="body" let-o>
                  <tr>
                    <td><code>{{o.code}}</code></td>
                    <td>{{o.value}}</td>
                    <td>{{o.descr}}</td>
                    <td>{{o.sort_order}}</td>
                    <td>{{o.is_active ? '✓' : ''}}</td>
                  </tr>
                </ng-template>
              </p-table>
            </ng-container>
            <ng-template #lookupPick>
              <p-message severity="info" text="Seleziona un attribute con lookup nel tab Definitions per gestirne le opzioni."></p-message>
            </ng-template>
          </p-tabpanel>

        </p-tabpanels>
      </p-tabs>

      <!-- ─── Create dialog ────────────────────────────────────────────────── -->
      <p-dialog [(visible)]="showCreateDialog" [modal]="true" header="Register Custom Attribute"
                [style]="{width: '480px'}">
        <div class="ca-form">
          <label>Context</label>
          <p-select [(ngModel)]="newDef.context" [options]="contexts" optionLabel="label" optionValue="value"></p-select>
          <label>Code</label>
          <input pInputText [(ngModel)]="newDef.code" placeholder="e.g. Risk_Level" />
          <label>Display Name</label>
          <input pInputText [(ngModel)]="newDef.displayName" placeholder="optional" />
          <label>Value Type</label>
          <p-select [(ngModel)]="newDef.valueType" [options]="valueTypes" optionLabel="label" optionValue="value"></p-select>
          <label>Has Lookup</label>
          <p-checkbox [(ngModel)]="newDef.hasLookup" [binary]="true"></p-checkbox>
          <label>Allow Multiple</label>
          <p-checkbox [(ngModel)]="newDef.allowMultiple" [binary]="true"></p-checkbox>
          <label>Required</label>
          <p-checkbox [(ngModel)]="newDef.isRequired" [binary]="true"></p-checkbox>
        </div>
        <ng-template pTemplate="footer">
          <button pButton label="Annulla" severity="secondary" (click)="showCreateDialog=false"></button>
          <button pButton label="Register" icon="pi pi-check" (click)="submitCreate()" [disabled]="!newDef.context || !newDef.code"></button>
        </ng-template>
      </p-dialog>

      <!-- ─── Lookup option dialog ─────────────────────────────────────────── -->
      <p-dialog [(visible)]="showLookupDialog" [modal]="true" header="New Lookup Option" [style]="{width: '420px'}">
        <div class="ca-form">
          <label>Code</label>
          <input pInputText [(ngModel)]="newLookup.code" />
          <label>Value</label>
          <input pInputText [(ngModel)]="newLookup.value" />
          <label>Description</label>
          <input pInputText [(ngModel)]="newLookup.descr" />
          <label>Sort Order</label>
          <input pInputText type="number" [(ngModel)]="newLookup.sortOrder" />
        </div>
        <ng-template pTemplate="footer">
          <button pButton label="Annulla" severity="secondary" (click)="showLookupDialog=false"></button>
          <button pButton label="Add" icon="pi pi-check" (click)="submitLookup()" [disabled]="!newLookup.code || !newLookup.value"></button>
        </ng-template>
      </p-dialog>
    </div>
  `,
  styles: [`
    .ca-admin { padding: 16px; }
    .ca-admin h2 { display: flex; gap: 8px; align-items: center; }
    .ca-toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .ca-toolbar label { font-weight: 500; }
    .ca-form { display: grid; grid-template-columns: 140px 1fr; gap: 10px 12px; align-items: center; }
    .ca-type { padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
    .ca-type-text     { background: #e3f2fd; color: #0d47a1; }
    .ca-type-number   { background: #e8f5e9; color: #1b5e20; }
    .ca-type-date     { background: #fff3e0; color: #e65100; }
    .ca-type-bool     { background: #f3e5f5; color: #4a148c; }
    .ca-type-lookup   { background: #ede7f6; color: #311b92; }
    .ca-type-currency { background: #e0f2f1; color: #004d40; }
    .ca-type-structure { background: #fafafa; color: #424242; }
  `],
})
export class CustomAttributesAdminComponent implements OnInit {
  activeTab: 'definitions' | 'lookups' = 'definitions';
  contextFilter = 'program';

  contexts = [
    { label: 'Program',           value: 'program'      },
    { label: 'Project',           value: 'project'      },
    { label: 'Resource',          value: 'resource'     },
    { label: 'Project Scenario',  value: 'scenario'     },
    { label: 'XBS Node',          value: 'xbs_node'     },
    { label: 'Program × XBS',     value: 'program_xbs'  },
  ];
  valueTypes = [
    { label: 'Text',      value: 'text'      },
    { label: 'Number',    value: 'number'    },
    { label: 'Date',      value: 'date'      },
    { label: 'Boolean',   value: 'bool'      },
    { label: 'Lookup',    value: 'lookup'    },
    { label: 'Currency',  value: 'currency'  },
    { label: 'Structure', value: 'structure' },
  ];

  definitions: CustomAttributeDefinition[] = [];
  lookupAttribute: CustomAttributeDefinition | null = null;
  lookupOptions: CustomLookupOption[] = [];

  // Create dialog state
  showCreateDialog = false;
  newDef: any = { context: 'program', code: '', valueType: 'text', hasLookup: false, allowMultiple: false, isRequired: false };

  // Lookup option dialog state
  showLookupDialog = false;
  newLookup: any = { code: '', value: '', descr: '', sortOrder: 0 };

  constructor(private caService: CustomAttributesService) {}

  ngOnInit(): void { void this.loadDefinitions(); }

  async loadDefinitions(): Promise<void> {
    this.definitions = await this.caService.listDefinitions(this.contextFilter);
  }

  openCreate(): void {
    this.newDef = { context: this.contextFilter, code: '', displayName: '', valueType: 'text', hasLookup: false, allowMultiple: false, isRequired: false };
    this.showCreateDialog = true;
  }
  async submitCreate(): Promise<void> {
    await this.caService.listDefinitions(this.contextFilter); // warmup
    try {
      const fetch = await import('wuic-framework-lib').then((m) => m as any);
      // Use service directly via injected HttpClient pattern (caService doesn't expose register today)
      // Workaround: call /api endpoint via fetch (or extend service in followup)
      const resp = await window.fetch('/api/custom-attributes/definitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          context: this.newDef.context, code: this.newDef.code,
          valueType: this.newDef.valueType, displayName: this.newDef.displayName || null,
          hasLookup: this.newDef.hasLookup, allowMultiple: this.newDef.allowMultiple,
          isRequired: this.newDef.isRequired,
        }),
      });
      if (resp.ok) {
        this.showCreateDialog = false;
        await this.loadDefinitions();
      }
    } catch (e) {
      console.error('Register CA failed', e);
    }
  }

  async loadLookupFor(d: CustomAttributeDefinition): Promise<void> {
    this.lookupAttribute = d;
    this.lookupOptions = await this.caService.getLookupOptions(d.id);
    this.activeTab = 'lookups';
  }

  openCreateLookupOption(): void {
    this.newLookup = { code: '', value: '', descr: '', sortOrder: this.lookupOptions.length };
    this.showLookupDialog = true;
  }
  async submitLookup(): Promise<void> {
    if (!this.lookupAttribute) return;
    await this.caService.upsertLookup({
      attributeId: this.lookupAttribute.id,
      code: this.newLookup.code,
      value: this.newLookup.value,
      descr: this.newLookup.descr,
      sort_order: Number(this.newLookup.sortOrder) || 0,
      external_id: undefined,
    } as any);
    this.showLookupDialog = false;
    this.lookupOptions = await this.caService.getLookupOptions(this.lookupAttribute.id);
  }
}
