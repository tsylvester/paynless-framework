import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import {
  registerReplayAction,
  stashPendingAction,
  checkAndReplayPendingAction,
} from './pendingAction';
import { logger } from './logger';
import type { PendingAction } from '@paynless/types';

const PENDING_ACTION_STORAGE_KEY = 'pendingActionDetails';

// Mock logger to prevent console output during tests
vi.mock('./logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

describe('Pending Action Manager', () => {
  const mockReplayFunction = vi.fn<[unknown], Promise<void>>(async () => {});
  const endpoint = 'chat';
  const body = { data: 'test-payload' };

  beforeEach(() => {
    vi.useFakeTimers();
    localStorageMock.clear();
    vi.clearAllMocks();
    // Must re-register for each test if registry is cleared
    registerReplayAction(endpoint, mockReplayFunction);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('registerReplayAction', () => {
    it('should register a new replay function', async () => {
      const action: PendingAction<typeof body> = {
        endpoint,
        method: 'POST',
        body: body,
      };
      stashPendingAction(action);
      await checkAndReplayPendingAction();
      expect(mockReplayFunction).toHaveBeenCalledWith(body);
    });

    it('should warn when overwriting an existing replay function', () => {
      const newReplayFunc = vi.fn();
      registerReplayAction(endpoint, newReplayFunc);
      expect(logger.warn).toHaveBeenCalledWith(
        `[PendingAction] Overwriting replay action for ${endpoint}`
      );
    });
  });

  describe('stashPendingAction', () => {
    it('should stringify and store the action in localStorage', () => {
      const action: PendingAction<typeof body> = {
        endpoint,
        method: 'POST',
        body: body,
      };

      stashPendingAction(action);

      const storedItem = localStorageMock.getItem(PENDING_ACTION_STORAGE_KEY);
      expect(storedItem).not.toBeNull();
      const parsedItem: PendingAction<typeof body> = JSON.parse(storedItem!);
      expect(parsedItem.endpoint).toBe(endpoint);
      expect(parsedItem.body).toEqual(body);
    });
  });

  describe('checkAndReplayPendingAction', () => {
    it('should return null and do nothing if no pending action exists', async () => {
      const result = await checkAndReplayPendingAction();
      expect(result).toBeNull();
      expect(localStorageMock.getItem(PENDING_ACTION_STORAGE_KEY)).toBeNull();
      expect(mockReplayFunction).not.toHaveBeenCalled();
    });

    it('should return null and clear storage if stored data is invalid JSON', async () => {
      localStorageMock.setItem(PENDING_ACTION_STORAGE_KEY, 'invalid-json');
      const result = await checkAndReplayPendingAction();
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        '[PendingAction] Failed to replay pending action.',
        expect.any(Object)
      );
      expect(localStorageMock.getItem(PENDING_ACTION_STORAGE_KEY)).toBeNull();
    });

    it('should return null and clear storage if stored action is not a valid PendingAction', async () => {
        localStorageMock.setItem(PENDING_ACTION_STORAGE_KEY, JSON.stringify({ wrong: 'shape' }));
        const result = await checkAndReplayPendingAction();
        expect(result).toBeNull();
        expect(logger.error).toHaveBeenCalledWith('[PendingAction] Invalid pending action found in storage.');
        expect(localStorageMock.getItem(PENDING_ACTION_STORAGE_KEY)).toBeNull();
    });

    it('should return null and clear storage if no replay function is registered for the action type', async () => {
        const unregisteredEndpoint = 'unregistered:action';
        const action: PendingAction<typeof body> = { endpoint: unregisteredEndpoint, method: 'POST', body: body };
        localStorageMock.setItem(PENDING_ACTION_STORAGE_KEY, JSON.stringify(action));

        const result = await checkAndReplayPendingAction();
        expect(result).toBeNull();
        expect(logger.error).toHaveBeenCalledWith(`[PendingAction] No replay function registered for action endpoint: ${unregisteredEndpoint}`);
        expect(localStorageMock.getItem(PENDING_ACTION_STORAGE_KEY)).toBeNull();
    });

    it('should successfully replay a valid action and clear storage', async () => {
        const action: PendingAction<typeof body> = { endpoint, method: 'POST', body: body };
        localStorageMock.setItem(PENDING_ACTION_STORAGE_KEY, JSON.stringify(action));

        const result = await checkAndReplayPendingAction();
        expect(result).toBeNull(); // No redirect URL
        expect(mockReplayFunction).toHaveBeenCalledWith(body);
        expect(logger.info).toHaveBeenCalledWith('[PendingAction] Replaying pending action...', { endpoint });
        expect(logger.info).toHaveBeenCalledWith('[PendingAction] Replay successful.', { endpoint });
        expect(localStorageMock.getItem(PENDING_ACTION_STORAGE_KEY)).toBeNull();
    });

    it('should return the redirect URL after a successful replay and clear storage', async () => {
        const returnPath = '/success';
        const action: PendingAction<typeof body> = { endpoint, method: 'POST', body: body, returnPath: returnPath };
        localStorageMock.setItem(PENDING_ACTION_STORAGE_KEY, JSON.stringify(action));

        const result = await checkAndReplayPendingAction();
        expect(result).toBe(returnPath);
        expect(mockReplayFunction).toHaveBeenCalledWith(body);
        expect(localStorageMock.getItem(PENDING_ACTION_STORAGE_KEY)).toBeNull();
    });
    
    it('should handle errors during replay, log them, and clear storage', async () => {
        const error = new Error('Replay failed!');
        mockReplayFunction.mockRejectedValue(error);
        const action: PendingAction<typeof body> = { endpoint, method: 'POST', body: body };
        localStorageMock.setItem(PENDING_ACTION_STORAGE_KEY, JSON.stringify(action));
    
        const result = await checkAndReplayPendingAction();
        expect(result).toBeNull();
        expect(logger.error).toHaveBeenCalledWith('[PendingAction] Failed to replay pending action.', { error });
        expect(localStorageMock.getItem(PENDING_ACTION_STORAGE_KEY)).toBeNull();
    });
  });
}); 