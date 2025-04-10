import { ReactNode } from 'react';
import { UserRole } from './auth.types';

export interface AppRoute {
  path: string;
  element: ReactNode;
  requireAuth?: boolean;
  allowedRoles?: UserRole[];
  children?: AppRoute[];
}