import { describe, it, expect } from 'vitest';
import { isUserRole } from './type_guards';

describe('isUserRole', () => {
  it('should return true for "user"', () => {
    expect(isUserRole('user')).toBe(true);
  });

  it('should return true for "admin"', () => {
    expect(isUserRole('admin')).toBe(true);
  });

  it('should return false for other strings', () => {
    expect(isUserRole('guest')).toBe(false);
    expect(isUserRole('superadmin')).toBe(false);
    expect(isUserRole('')).toBe(false);
  });

  it('should return false for non-string types', () => {
    expect(isUserRole(null)).toBe(false);
    expect(isUserRole(undefined)).toBe(false);
    expect(isUserRole(123)).toBe(false);
    expect(isUserRole({})).toBe(false);
    expect(isUserRole([])).toBe(false);
  });
});
