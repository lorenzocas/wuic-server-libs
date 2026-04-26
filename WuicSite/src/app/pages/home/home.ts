import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { SeoService } from '../../services/seo.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink, ButtonModule, CardModule, DialogModule, TranslatePipe],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home {
  constructor() {
    inject(SeoService).set({ titleKey: 'seo.home.title', descriptionKey: 'seo.home.description', path: '/' });
  }
  /**
   * Feature cards shown in the "Tutto incluso, zero boilerplate" section.
   * Only the icon + i18n key travel here; title/desc are looked up via
   * `home.features.{key}.title` / `.desc` in the translation JSON files.
   */
  features = [
    { icon: 'pi pi-database',        key: 'metadataDriven' },
    { icon: 'pi pi-objects-column',  key: 'visualDesigner' },
    { icon: 'pi pi-sitemap',         key: 'workflowEngine' },
    { icon: 'pi pi-file',            key: 'reportBuilder'  },
    { icon: 'pi pi-comments',        key: 'ragChatbot'     },
    { icon: 'pi pi-cog',             key: 'multiDbms'      }
  ];

  screenshots = [
    { thumb: 'screenshots/thumbs/list-grid.jpg', full: 'screenshots/list-grid.png', caption: 'List Grid' },
    { thumb: 'screenshots/thumbs/designer.jpg',  full: 'screenshots/designer.png',  caption: 'Designer' },
    { thumb: 'screenshots/thumbs/kanban.jpg',    full: 'screenshots/kanban.png',    caption: 'Kanban' },
    { thumb: 'screenshots/thumbs/chart.jpg',     full: 'screenshots/chart.png',     caption: 'Chart' },
    { thumb: 'screenshots/thumbs/map.jpg',       full: 'screenshots/map.png',       caption: 'Map' },
    { thumb: 'screenshots/thumbs/grid-edit.jpg', full: 'screenshots/grid-edit.png', caption: 'Edit Form' }
  ];

  lightboxVisible = signal(false);
  lightboxSrc = signal('');
  lightboxCaption = signal('');

  openLightbox(shot: any) {
    this.lightboxSrc.set(shot.full);
    this.lightboxCaption.set(shot.caption);
    this.lightboxVisible.set(true);
  }
}
