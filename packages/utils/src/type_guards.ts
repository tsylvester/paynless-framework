import { UserRole } from '@paynless/types';

export function isUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && ['user', 'admin'].includes(role);
}
