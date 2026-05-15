export interface RouteRoleRule {
  key: string;
  routePattern: string;
  roles: string[];
}

export const FRAMEWORK_ROUTE_ROLE_RULES: RouteRoleRule[] = [
  // {
  //   key: 'designer',
  //   routePattern: 'designer',
  //   roles: ['admin']
  // },
  // {
  //   key: 'workflow-designer',
  //   routePattern: 'workflow-designer',
  //   roles: ['admin']
  // },
  // {
  //   key: 'dashboard',
  //   routePattern: ':route/dashboard',
  //   roles: ['admin']
  // },
  // {
  //   key: 'report-designer',
  //   routePattern: ':route/report-designer',
  //   roles: ['admin']
  // }
];

