import { CanDeactivateFn } from '@angular/router';
import { DesignerRouteComponent } from './designer.route.component';

export const designerPendingChangesGuard: CanDeactivateFn<DesignerRouteComponent> = async (component) => {
  if (!component) {
    return true;
  }

  return await component.confirmNavigationWithPendingChanges();
};
