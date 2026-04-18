import { Component } from '@angular/core';
import { CardModule } from 'primeng/card';
import { AccordionModule } from 'primeng/accordion';
import { TranslatePipe } from '@ngx-translate/core';

interface FeatureItem {
  icon: string;
  key: string;        // i18n subkey: features.categories.{catKey}.{key}
}

interface FeatureCategory {
  catKey: string;     // i18n subkey: features.categories.{catKey}.title
  items: FeatureItem[];
}

@Component({
  selector: 'app-features',
  imports: [CardModule, AccordionModule, TranslatePipe],
  templateUrl: './features.html',
  styleUrl: './features.scss'
})
export class Features {
  /**
   * Feature categories — only icons + i18n keys live here. Titles and
   * descriptions are resolved at render time from the loaded translation JSON
   * under `features.categories.{catKey}.{itemKey}.title` and `.desc`.
   */
  categories: FeatureCategory[] = [
    {
      catKey: 'dataLayer',
      items: [
        { icon: 'pi pi-database', key: 'dataSource' },
        { icon: 'pi pi-list',     key: 'dataRepeater' },
        { icon: 'pi pi-pencil',   key: 'crud' },
        { icon: 'pi pi-filter',   key: 'filterBar' }
      ]
    },
    {
      catKey: 'uiComponents',
      items: [
        { icon: 'pi pi-objects-column',   key: 'designer' },
        { icon: 'pi pi-th-large',         key: 'fieldWidgets' },
        { icon: 'pi pi-window-maximize',  key: 'parametricDialog' },
        { icon: 'pi pi-palette',          key: 'themes' }
      ]
    },
    {
      catKey: 'businessLogic',
      items: [
        { icon: 'pi pi-sitemap',  key: 'workflowDesigner' },
        { icon: 'pi pi-file',     key: 'reportDesigner' },
        { icon: 'pi pi-calendar', key: 'scheduler' },
        { icon: 'pi pi-bell',     key: 'notifications' }
      ]
    },
    {
      catKey: 'infrastructure',
      items: [
        { icon: 'pi pi-cog',      key: 'multiDbms' },
        { icon: 'pi pi-shield',   key: 'auth' },
        { icon: 'pi pi-comments', key: 'rag' },
        { icon: 'pi pi-globe',    key: 'i18n' }
      ]
    }
  ];
}
