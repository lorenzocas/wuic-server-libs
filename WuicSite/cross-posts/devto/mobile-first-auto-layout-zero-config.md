---
title: "Mobile-first auto-layout with zero config: how WUIC reflows enterprise tables on a phone"
published: false
description: "Most enterprise UIs are desktop-only. WUIC's list-grid and edit-form switch to mobile layouts automatically below 768px — table becomes card stack, two-column form becomes vertical flex, no per-screen template, no per-column responsive flag. This post explains the exact split between runtime swap (TS) and CSS-only fallback (SCSS) and why we picked that split."
tags: angular, responsive, mobile
canonical_url: https://wuic-framework.com/blog/mobile-first-auto-layout-zero-config
---

A complaint that comes up every time we demo WUIC to someone with a CRM or back-office app: *"this is all very nice on a 27-inch monitor, but our reps live on iPads in the field, and your default list view is unreadable on a phone."*

It used to be a fair complaint. The fix wasn't dramatic — it's about 600 lines of code across three components and one service. But what we got out of it is **zero per-screen configuration for mobile**: every existing scaffolded route automatically gets a card-stack layout on phones and a column-stacked edit form, and the dev doesn't write a single media query.

This post walks through how it's wired, and where it draws the line.

## The default behavior

Open any list page on the [public demo](https://wuic-framework.com/sandbox) at 1920×1080 and you see a `<p-table>` from PrimeNG: dense, columnar, scrollable, with sort/filter/group headers. The classic enterprise table.

Now resize the window below 768px (or open it on a phone). The table disappears, and in its place is a vertical stack of cards. Each card has the row's most important fields (the ones flagged `mddetailaction=1` or with high `mc_ordine`), a tap-target, and a small action chip in the corner.

![Same list-grid resized live — desktop table swaps to vertical card stack the moment the viewport crosses 768px](https://wuic-framework.com/assets/wuic-framework-docs/screenshots/list-grid__list-grid-responsive__mobile.gif)

No metadata change. No `if (mobile) { ... }` in your app code. Same route, same datasource, same metadata — the framework swaps the template.

The same swap happens on the edit form (`<wuic-parametric-dialog>`): two-column desktop layout collapses to a single column, fields go full-width, the dialog itself goes full-screen.

## Where the swap lives

There are two distinct mechanisms because they solve different problems.

### List-grid: runtime template swap (TS)

The list-grid renders a real PrimeNG `<p-table>` on desktop. That component is *huge* and not easily restyled into a card stack via CSS — its DOM is built around `<tr>`/`<td>`. Rather than fight it, we swap the entire subtree on mobile:

```html
<!-- list-grid.component.html (simplified) -->
<div class="list-grid-container">
  @if (rowTemplate && !(deviceAwareness.isMobile$ | async)) {
    <p-table [value]="records" ...>...</p-table>
  }
  @if (mobileCardComponent && (deviceAwareness.isMobile$ | async)) {
    <div class="wuic-mobile-card-list">
      @for (rowData of records; track $index) {
        <div class="wuic-mobile-card">
          <ng-container *ngComponentOutlet="mobileCardComponent;
                                            inputs: { rowData, ... }">
          </ng-container>
        </div>
      }
      <p-paginator (onPageChange)="onMobilePageChange($event)"></p-paginator>
    </div>
  }
</div>
```

`deviceAwareness.isMobile$` is an `Observable<boolean>` from a singleton service:

```ts
@Injectable({ providedIn: 'root' })
export class DeviceAwarenessService {
  readonly isMobile$: Observable<boolean>;  // distinctUntilChanged
  // Constructor reads MetadataProviderService.widgetDefinition.mobileBreakpointPx
  // (default 768) and creates a matchMedia(`(max-width: ${px}px)`) listener.
}
```

So when the viewport crosses the breakpoint, the observable emits, the table unmounts, the card list mounts. No flash, no double-fetch — the data is already in the parent component's `records` array.

The `mobileCardComponent` is **compiled at runtime** from an Angular template string. Why? Because hosts can override the per-card template via metadata:

```ts
MetadataProviderService.widgetDefinition.mobileCardTemplate = `
  <div class="my-app-card">
    <div class="header">{{ rowData.name }}</div>
    <div class="subline">{{ rowData.country_code }} · {{ rowData.vat_number }}</div>
    <wuic-data-action-button-lazy [record]="rowData" .../>
  </div>
`;
```

The framework uses Angular's internal `ɵcompileComponent` to compile that string into a real component class, then plugs it into `*ngComponentOutlet`. Without override, the default template is a label/value list of the columns flagged for the mobile view.

That's it for the list-grid. There is no "mobile CSS" — the swap is structural, the inner CSS is plain card layout.

### Edit-form: CSS-only fallback (SCSS)

The edit form is the opposite call. `<wuic-parametric-dialog>` already builds a flexbox row layout in plain HTML — there's no library DOM fighting us. So we don't swap the template at all; we just stack everything on mobile via a media query:

```scss
// parametric-dialog.component.scss
@media (max-width: 768px) {
  .row {
    flex-direction: column !important;
    flex-wrap: nowrap !important;
  }
  .data-field-wrapper,
  .data-field-field {
    width: 100% !important;
  }
}
```

The `!important` is defensive: column widths can come from `mc_ui_size_width` per-column (a designer-saved value) and we want the media query to win on small screens. The same defensive media query lives in `field-editor.component.scss` so it works whether the field is hosted directly or inside a wrapper.

Total mobile-specific code for edit-form: about 15 lines of SCSS. No TypeScript.

Why the asymmetry? Because PrimeNG's `<p-table>` is too coupled to its `<table>` DOM to morph into cards with CSS. The edit form, being our own template, is flexbox-native and reflows cleanly. The right answer was different for each.

## What we don't try to handle automatically

We've seen "responsive mode" sold as a magic checkbox, and we don't want to over-promise. Here's the explicit list of what stays manual:

- **Per-column priority on the card.** The default shows the first 4 columns by `mc_ordine`. If you want "show name + city + last_seen on the card, hide the rest", you set `mc_hide_in_list` per-column on a *mobile-only* condition. We don't have a dedicated `mobile_visible` flag — we reuse the existing condition system, because adding a second flag for every responsive concern is how metadata schemas balloon.
- **Filter bar.** On desktop it sits inline above the list and collapses if you don't need it. On mobile that's unusable (it ate 60% of the viewport in early prototypes). The fix is a swap to a `<p-dialog>` modal (95vw × 85vh) — that one's metadata-free, hard-coded in `filter-bar.component.ts`. If you don't like the modal style, you override the component, not the metadata.
- **The dashboard designer.** Drag-and-drop on a phone is bad UX in principle. We just hide the designer button below the breakpoint. Read-mode dashboards reflow fine (each tile becomes full-width).
- **Custom Angular components.** If you wrote a custom widget (a colour picker, a map, a charting widget) and didn't think about mobile, it'll look bad on mobile. The framework doesn't know how to reflow third-party components — that's on you.

## The breakpoint

The default is 768px, which matches the PrimeNG and Bootstrap convention. Override per app at bootstrap:

```ts
import { MetadataProviderService } from 'wuic-framework-lib';

bootstrapApplication(App, {
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: (md: MetadataProviderService) => () => {
        md.widgetDefinition.mobileBreakpointPx = 1024;  // tablet-aware
        md.widgetDefinition.mobileCardTemplate = '...';  // optional
      },
      deps: [MetadataProviderService],
      multi: true
    }
  ]
});
```

The breakpoint is read **once** at `DeviceAwarenessService` construction. Changing it at runtime is technically possible but we haven't needed it — the use case is "this app is for tablet primarily, raise the threshold to 1024" or "this app is for warehouse scanner devices, lower it to 600".

## Performance corner

Two things worth mentioning, both of which we got wrong the first time:

**Virtualization on mobile.** Card-stack lists can have hundreds of rows. We initially rendered them all into the DOM — fine for 50 cards, smelly for 500. The fix was `<p-virtualscroller>` gated by the same `isListVirtualizationEnabled()` switch the desktop table uses. Each card has an `getMobileCardEstimatedHeight()` so the scroller can layout without measuring.

**No double subscribe.** The `isMobile$` observable goes through `distinctUntilChanged`, so the listener doesn't re-trigger the entire `<p-table>`/`<wuic-mobile-card-list>` swap on every resize tick. Just on the boolean transition.

## When it's not enough

If you need a layout that's neither a desktop table nor a vertical card stack — say, a kanban board on phone, or a horizontally-paginated card carousel — the right answer is a different archetype, not a flag. Set the route's archetype to `kanban` or `carousel`, and the runtime renders that on both desktop and mobile (with their own breakpoint behavior).

Mobile auto-layout in WUIC handles the *transactional* archetypes (list + edit form), which is 80% of an enterprise back-office. The 20% — kanban, scheduler, map — has its own per-archetype responsive story.

## Try it

The public [demo](https://wuic-framework.com/sandbox) runs on Chrome at any width. Open DevTools, switch to a phone profile, navigate to any list — you'll see the card swap live. The credentials are on the [sandbox landing page](https://wuic-framework.com/sandbox); login takes 2 seconds.

The full list of files involved (for the curious): `device-awareness.service.ts`, `list-grid.component.{html,ts,scss}`, `dynamic-card-template.component.ts`, `parametric-dialog.component.scss`, `field-editor.component.scss`. Plus the `widgetDefinition.mobileCardTemplate` and `widgetDefinition.mobileBreakpointPx` hooks for app-side override.

The next post in this series digs into the **dashboard designer** — drag-and-drop UI that writes JSON metadata, and how we make designer-saved boards survive runtime upgrades. Subscribe via the RSS feed if you want the rest.
