import { CanDeactivateFn } from '@angular/router';
import { BoundedRepeaterComponent } from './bounded-repeater.component';

export const boundedRepeaterPendingChangesGuard: CanDeactivateFn<BoundedRepeaterComponent> = async (component) => {
  if (!component) {
    return true;
  }

  return await component.confirmNavigationWithPendingChanges();
};

