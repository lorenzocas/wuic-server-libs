import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { MetadataProviderService } from './metadata-provider.service';

@Injectable({ providedIn: 'root' })
export class DeviceAwarenessService implements OnDestroy {
  private static readonly DEFAULT_BREAKPOINT_PX = 768;

  private mediaQueryList?: MediaQueryList;
  private mediaQueryListener?: (e: MediaQueryListEvent) => void;
  private readonly isMobileSubject = new BehaviorSubject<boolean>(false);

  readonly isMobile$: Observable<boolean> = this.isMobileSubject.pipe(distinctUntilChanged());

  constructor() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const breakpointPx = this.resolveBreakpointPx();
    this.mediaQueryList = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    this.isMobileSubject.next(this.mediaQueryList.matches);

    this.mediaQueryListener = (e: MediaQueryListEvent) => this.isMobileSubject.next(e.matches);
    if (typeof this.mediaQueryList.addEventListener === 'function') {
      this.mediaQueryList.addEventListener('change', this.mediaQueryListener);
    } else if (typeof (this.mediaQueryList as any).addListener === 'function') {
      (this.mediaQueryList as any).addListener(this.mediaQueryListener);
    }
  }

  get isMobile(): boolean {
    return this.isMobileSubject.value;
  }

  ngOnDestroy(): void {
    if (this.mediaQueryList && this.mediaQueryListener) {
      if (typeof this.mediaQueryList.removeEventListener === 'function') {
        this.mediaQueryList.removeEventListener('change', this.mediaQueryListener);
      } else if (typeof (this.mediaQueryList as any).removeListener === 'function') {
        (this.mediaQueryList as any).removeListener(this.mediaQueryListener);
      }
    }
  }

  private resolveBreakpointPx(): number {
    const configured = MetadataProviderService.widgetDefinition?.mobileBreakpointPx;
    if (typeof configured === 'number' && configured > 0 && Number.isFinite(configured)) {
      return Math.floor(configured);
    }
    return DeviceAwarenessService.DEFAULT_BREAKPOINT_PX;
  }
}
