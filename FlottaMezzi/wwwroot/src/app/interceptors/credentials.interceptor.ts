import { HttpInterceptorFn } from '@angular/common/http';

export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  // Always include cookies for cross-origin calls to backend APIs.
  return next(req.clone({ withCredentials: true }));
};
