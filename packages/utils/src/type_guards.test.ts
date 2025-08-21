import { describe, it, expect } from 'vitest';
import { 
    isUserRole, 
    isChatContextPreferences,
    isDialecticLifecycleEventType,
    isDialecticContribution,
    isApiError 
} from './type_guards';

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

describe('isDialecticLifecycleEventType', () => {
    it('should return true for valid dialectic event types', () => {
        expect(isDialecticLifecycleEventType('contribution_generation_started')).toBe(true);
        expect(isDialecticLifecycleEventType('dialectic_contribution_received')).toBe(true);
    });

    it('should return false for invalid event types', () => {
        expect(isDialecticLifecycleEventType('some_other_event')).toBe(false);
        expect(isDialecticLifecycleEventType('WALLET_TRANSACTION')).toBe(false);
        expect(isDialecticLifecycleEventType('')).toBe(false);
    });
});

describe('isDialecticContribution', () => {
    const validContribution = {
        id: 'c-1',
        session_id: 's-1',
        stage: 'test',
        iteration_number: 1,
        is_latest_edit: true,
        // other valid properties can be added here
    };

    it('should return true for a valid contribution object', () => {
        expect(isDialecticContribution(validContribution)).toBe(true);
    });

    it('should return false if a required property is missing', () => {
        const { id, ...invalid } = validContribution;
        expect(isDialecticContribution(invalid)).toBe(false);
    });

    it('should return false if a property has the wrong type', () => {
        const invalid = { ...validContribution, id: 123 };
        expect(isDialecticContribution(invalid)).toBe(false);
    });

    it('should return false for non-object inputs', () => {
        expect(isDialecticContribution(null)).toBe(false);
        expect(isDialecticContribution('string')).toBe(false);
        expect(isDialecticContribution(undefined)).toBe(false);
    });
});

describe('isApiError', () => {
    const validError = {
        code: 'TEST_ERROR',
        message: 'This is a test error',
    };

    it('should return true for a valid API error object', () => {
        expect(isApiError(validError)).toBe(true);
    });

    it('should return false if "code" is missing', () => {
        const invalid = { message: 'test' };
        expect(isApiError(invalid)).toBe(false);
    });

    it('should return false if "message" has wrong type', () => {
        const invalid = { code: 'TEST', message: 123 };
        expect(isApiError(invalid)).toBe(false);
    });

    it('should return false for non-object inputs', () => {
        expect(isApiError(null)).toBe(false);
        expect(isApiError([])).toBe(false);
    });
});
