import { Component } from '@angular/core';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TranslatePipe } from '@ngx-translate/core';

interface DownloadEntry {
  name: string;
  audience: string;
  rag: boolean;
  tutorial: string;
  size: string;
  filename: string;
}

@Component({
  selector: 'app-downloads',
  imports: [TableModule, TagModule, ButtonModule, CardModule, TranslatePipe],
  templateUrl: './downloads.html',
  styleUrl: './downloads.scss'
})
export class Downloads {
  version = { server: '0.3.3', client: '11.9.0' };

  downloads: DownloadEntry[] = [
    { name: 'WuicTest Source (leggero)', audience: 'src', rag: false, tutorial: 'no', size: '~15 MB', filename: `WuicTest-src-server-${this.version.server}-client-${this.version.client}.zip` },
    { name: 'WuicTest Source + RAG', audience: 'src', rag: true, tutorial: 'no', size: '~80 MB', filename: `WuicTest-src-server-${this.version.server}-rag-client-${this.version.client}.zip` },
    { name: 'WuicTest Source + Tutorial', audience: 'src', rag: true, tutorial: 'SQL', size: '~900 MB', filename: `WuicTest-src-tutorial-server-${this.version.server}-rag-client-${this.version.client}.zip` },
    { name: 'WuicTest IIS', audience: 'iis', rag: true, tutorial: 'no', size: '~120 MB', filename: `WuicTest-iis-server-${this.version.server}-rag-client-${this.version.client}.zip` },
    { name: 'WuicTest IIS + Tutorial', audience: 'iis', rag: true, tutorial: 'SQL', size: '~1 GB', filename: `WuicTest-iis-tutorial-server-${this.version.server}-rag-client-${this.version.client}.zip` },
    { name: 'WuicTest IIS + Tutorial (BAK)', audience: 'iis', rag: true, tutorial: 'BAK', size: '~1.2 GB', filename: `WuicTest-iis-tutorial-bak-server-${this.version.server}-rag-client-${this.version.client}.zip` }
  ];

  getDownloadUrl(entry: DownloadEntry): string {
    return `/downloads/${entry.filename}`;
  }
}
