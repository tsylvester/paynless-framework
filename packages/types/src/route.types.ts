import { ReactNode } from 'react';
import type { Database } from '@paynless/db-types';

// Alias the enum type for easier use
type UserRole = Database['public']['Enums']['user_role'];

export interface AppRoute {
  path: string;
  index?: boolean;
  element: ReactNode;
  requireAuth?: boolean;
  allowedRoles?: UserRole[];
  children?: AppRoute[];
}