import { describe, it, expect } from 'vitest';
import { isUserRole, isChatContextPreferences } from './type_guards';

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

describe('isChatContextPreferences', () => {
  it('should return true for a valid object with all properties as strings', () => {
    const obj = {
      newChatContext: 'personal',
      selectedProviderId: 'provider-1',
      selectedPromptId: 'prompt-1',
    };
    expect(isChatContextPreferences(obj)).toBe(true);
  });

  it('should return true for a valid object with all properties as null', () => {
    const obj = {
      newChatContext: null,
      selectedProviderId: null,
      selectedPromptId: null,
    };
    expect(isChatContextPreferences(obj)).toBe(true);
  });

  it('should return true for a valid object with a mix of string and null properties', () => {
    const obj = {
      newChatContext: 'personal',
      selectedProviderId: null,
      selectedPromptId: 'prompt-1',
    };
    expect(isChatContextPreferences(obj)).toBe(true);
  });

  it('should return true for an object with some optional properties missing', () => {
    const obj = {
      newChatContext: 'personal',
    };
    expect(isChatContextPreferences(obj)).toBe(true);
  });

  it('should return true for an empty object', () => {
    const obj = {};
    expect(isChatContextPreferences(obj)).toBe(true);
  });

  it('should return false if a property has an invalid type', () => {
    const obj = {
      newChatContext: 123, // Invalid type
      selectedProviderId: 'provider-1',
      selectedPromptId: 'prompt-1',
    };
    expect(isChatContextPreferences(obj)).toBe(false);
  });

  it('should return false for non-object types', () => {
    expect(isChatContextPreferences(null)).toBe(false);
    expect(isChatContextPreferences(undefined)).toBe(false);
    expect(isChatContextPreferences(123)).toBe(false);
    expect(isChatContextPreferences('string')).toBe(false);
    expect(isChatContextPreferences([])).toBe(false);
  });

  it('should return true for an object with extra properties', () => {
    const obj = {
      newChatContext: 'personal',
      selectedProviderId: 'provider-1',
      selectedPromptId: 'prompt-1',
      extraProp: 'should be ignored',
    };
    expect(isChatContextPreferences(obj)).toBe(true);
  });
});
