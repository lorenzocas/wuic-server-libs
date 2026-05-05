import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'wuic-view-builder-connection',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg [attr.data-testid]="'connection-' + data?.id" class="vb-connection">
      <path [attr.d]="path" fill="none" [attr.stroke]="strokeColor" stroke-width="2.5" />
      <!-- Join type glyph at midpoint -->
      <g *ngIf="midX || midY" class="vb-conn-glyph" [attr.transform]="'translate(' + midX + ',' + midY + ')'">
        <ng-container [ngSwitch]="joinType">
          <!-- INNER: no glyph (plain line) -->

          <!-- LEFT: arrow pointing left ◄ -->
          <ng-container *ngSwitchCase="'LEFT'">
            <polygon points="-10,-7 4,0 -10,7" [attr.fill]="strokeColor" stroke="#fff" stroke-width="1" />
          </ng-container>

          <!-- RIGHT: arrow pointing right ► -->
          <ng-container *ngSwitchCase="'RIGHT'">
            <polygon points="10,-7 -4,0 10,7" [attr.fill]="strokeColor" stroke="#fff" stroke-width="1" />
          </ng-container>

          <!-- FULL: filled circle ● -->
          <ng-container *ngSwitchCase="'FULL'">
            <circle r="7" [attr.fill]="strokeColor" stroke="#fff" stroke-width="1.5" />
          </ng-container>
        </ng-container>
      </g>
    </svg>
  `,
  styles: [`
    :host { display: block; position: absolute; top: 0; left: 0; pointer-events: none; overflow: visible; width: 0; height: 0; }
    svg { overflow: visible; position: absolute; top: 0; left: 0; width: 9999px; height: 9999px; pointer-events: none; }
    path { pointer-events: stroke; cursor: pointer; }
    .vb-conn-glyph { pointer-events: all; cursor: pointer; }
  `],
  host: { 'data-testid': 'vb-connection' }
})
export class ViewBuilderConnectionComponent implements OnChanges {
  @Input() data!: any;
  @Input() start!: any;
  @Input() end!: any;
  @Input() path!: string;

  midX = 0;
  midY = 0;
  joinType = 'LEFT';
  clipId = 'clip_' + Math.random().toString(36).substring(7);

  get strokeColor(): string {
    switch (this.joinType) {
      case 'INNER': return '#3B82F6';
      case 'RIGHT': return '#f59e0b';
      case 'FULL': return '#8b5cf6';
      default: return '#22c55e';
    }
  }

  get badgeFill(): string {
    return '#fff';
  }

  get glyphStroke(): string {
    return this.strokeColor;
  }

  get highlightFill(): string {
    return this.strokeColor + '40'; // 25% opacity
  }

  ngOnChanges(): void {
    // Calculate midpoint from the SVG path string (Bezier curve: M x1 y1 C cx1 cy1 cx2 cy2 x2 y2)
    this.computeMidpoint();

    // Read join type from connection data (set by view-builder)
    this.joinType = (this.data as any)?._joinType || 'LEFT';
  }

  private computeMidpoint(): void {
    if (!this.path) { this.midX = 0; this.midY = 0; return; }
    // Parse "M x1 y1 C cx1 cy1 cx2 cy2 x2 y2"
    const nums = this.path.match(/-?[\d.]+/g)?.map(Number);
    if (!nums || nums.length < 8) { this.midX = 0; this.midY = 0; return; }
    // Cubic bezier at t=0.5: B(0.5) = (1-t)^3*P0 + 3*(1-t)^2*t*P1 + 3*(1-t)*t^2*P2 + t^3*P3
    const [x0, y0, cx1, cy1, cx2, cy2, x1, y1] = nums;
    const t = 0.5;
    const mt = 1 - t;
    this.midX = mt*mt*mt*x0 + 3*mt*mt*t*cx1 + 3*mt*t*t*cx2 + t*t*t*x1;
    this.midY = mt*mt*mt*y0 + 3*mt*mt*t*cy1 + 3*mt*t*t*cy2 + t*t*t*y1;
  }
}
