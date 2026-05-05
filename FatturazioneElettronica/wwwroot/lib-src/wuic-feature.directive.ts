import {
  Directive,
  Input,
  OnDestroy,
  OnInit,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { LicenseFeatureService } from './service/license-feature.service';

/**
 * Structural directive that renders its host only if the current license
 * includes the given feature flag. The check is reactive: if the license
 * status changes (e.g. after `LicenseFeatureService.refresh()`), the embedded
 * view is created or destroyed accordingly.
 *
 * Usage:
 *   <button *wuicFeature="'workflow-designer'">Open workflow designer</button>
 *   <ng-container *wuicFeature="'spreadsheet'">
 *     <wuic-spreadsheet ...></wuic-spreadsheet>
 *   </ng-container>
 *
 * Important: this is UX only. Server-side gates ([RequireFeature] attribute,
 * board content sanitizer, data decoration) are the real enforcement.
 */
@Directive({
  selector: '[wuicFeature]',
  standalone: true,
})
export class WuicFeatureDirective implements OnInit, OnDestroy {

  private feature: string = '';
  private embedded = false;
  private sub: Subscription | null = null;

  @Input() set wuicFeature(value: string) {
    this.feature = (value ?? '').trim();
    this.applyGate();
  }

  constructor(
    private tpl: TemplateRef<unknown>,
    private vcr: ViewContainerRef,
    private licenseFeatureService: LicenseFeatureService
  ) { }

  ngOnInit(): void {
    this.sub = this.licenseFeatureService.status$().subscribe(() => this.applyGate());
    this.applyGate();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.vcr.clear();
    this.embedded = false;
  }

  private applyGate(): void {
    const allowed = !this.feature || this.licenseFeatureService.has(this.feature);
    if (allowed && !this.embedded) {
      this.vcr.createEmbeddedView(this.tpl);
      this.embedded = true;
    } else if (!allowed && this.embedded) {
      this.vcr.clear();
      this.embedded = false;
    }
  }
}
