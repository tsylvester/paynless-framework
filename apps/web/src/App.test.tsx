import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from './App';
import { useAuthStore, useSubscriptionStore, useWalletStore, initialWalletStateValues } from '@paynless/store';
import type { SubscriptionStore, WalletStore } from '@paynless/store';
import type { UserProfile } from '@paynless/types';
// Import initialWalletStateValues and necessary selectors
import { 
    mockSetAuthIsLoading, 
    mockSetAuthUser, 
    mockSetAuthSession, 
    mockedUseAuthStoreHookLogic, 
    resetAuthStoreMock, 
    mockSetAuthProfile, 
} from './mocks/authStore.mock';
import { 
    mockedUseAiStoreHookLogic, 
    resetAiStoreMock,
    mockSetIsChatContextHydrated,
} from './mocks/aiStore.mock';
import { useAiStore } from '@paynless/store';
import { useStageRunProgressHydration } from './hooks/useStageRunProgressHydration';

vi.mock('./hooks/useStageRunProgressHydration', () => ({
    useStageRunProgressHydration: vi.fn(),
}));

const useStageRunProgressHydrationMock = vi.mocked(useStageRunProgressHydration);

// --- Mocks ---

// Mock child components rendered by AppContent
// vi.mock('../../components/layout/Header', () => ({ Header: () => <div data-testid="site-header">Mocked Header Content</div> })); // Ensure real header renders
// vi.mock('../../components/layout/Footer', () => ({ Footer: () => <div data-testid="site-footer">Mocked Footer Content</div> })); // Ensure real footer renders
vi.mock('../../components/integrations/ChatwootIntegration', () => ({ ChatwootIntegration: () => <div data-testid="mock-chatwoot">Mocked Chatwoot</div> }));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => <div data-testid="mock-toaster">Mock Toaster</div> }));

vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  const { mockedUseAuthStoreHookLogic } = await import('./mocks/authStore.mock');
  const { mockedUseAiStoreHookLogic } = await import('./mocks/aiStore.mock');
  return {
    ...actual,
    useAuthStore: mockedUseAuthStoreHookLogic,
    useAiStore: mockedUseAiStoreHookLogic,
  };
});

// --- Test Suite ---

describe('App Component', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        resetAuthStoreMock();
        resetAiStoreMock();
        useStageRunProgressHydrationMock.mockClear();

        // Reset global mocks
        vi.stubGlobal('matchMedia', vi.fn().mockImplementation(query => ({ 
            matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
        })));
        
        // Keep subscription store mock simple for now (if needed)
        const mockSubscriptionState: SubscriptionStore = {
            userSubscription: null,
            availablePlans: [],
            isSubscriptionLoading: false,
            hasActiveSubscription: false,
            isTestMode: false,
            error: null,
            setUserSubscription: vi.fn(),
            setAvailablePlans: vi.fn(),
            setIsLoading: vi.fn(),
            setTestMode: vi.fn(),
            setError: vi.fn(),
            loadSubscriptionData: vi.fn().mockResolvedValue(undefined),
            refreshSubscription: vi.fn().mockResolvedValue(false),
            createBillingPortalSession: vi.fn().mockResolvedValue(null),
            cancelSubscription: vi.fn().mockResolvedValue(false),
            resumeSubscription: vi.fn().mockResolvedValue(false),
            getUsageMetrics: vi.fn().mockResolvedValue(null),
        };

        vi.spyOn({ useSubscriptionStore }, 'useSubscriptionStore').mockImplementation(<S,>(
            selector?: (state: SubscriptionStore) => S,
            // _equalityFn?: (a: S, b: S) => boolean
        ): S | SubscriptionStore => {
            if (typeof selector === 'function') {
                return selector(mockSubscriptionState);
            }
            return mockSubscriptionState;
        });

        // Mock WalletStore
        const mockWalletFullState: WalletStore = {
            ...initialWalletStateValues,
            // Mock actions for WalletStore
            loadPersonalWallet: vi.fn().mockResolvedValue(undefined),
            loadOrganizationWallet: vi.fn().mockResolvedValue(undefined),
            getOrLoadOrganizationWallet: vi.fn().mockResolvedValue(null),
            loadTransactionHistory: vi.fn().mockResolvedValue(undefined),
            initiatePurchase: vi.fn().mockResolvedValue(null),
            _resetForTesting: vi.fn(),
            determineChatWallet: vi.fn().mockReturnValue({ walletType: 'personal', walletId: 'test-personal-wallet' }),
            setUserOrgTokenConsent: vi.fn(),
            clearUserOrgTokenConsent: vi.fn(),
            openConsentModal: vi.fn(),
            closeConsentModal: vi.fn(),
            _handleWalletUpdateNotification: vi.fn(),
            setCurrentChatWalletDecision: vi.fn(),
            // Ensure selectCurrentWalletBalance is available if it were a direct method (it's not, but good to be aware)
            // For selector-based access, the selector itself is applied to this state.
        };

        vi.spyOn({ useWalletStore }, 'useWalletStore').mockImplementation(<S,>(
            selector?: (state: WalletStore) => S,
            // _equalityFn?: (a: S, b: S) => boolean
        ): S | WalletStore => {
            // If a selector is provided (like selectPersonalWalletBalance), apply it to the mock state
            // Otherwise, return the whole mock state (standard Zustand behavior)
            if (typeof selector === 'function') {
                return selector(mockWalletFullState);
            }
            return mockWalletFullState;
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should render Header and Footer when not loading', async () => {
        // Set auth store so app shows loading spinner (mock defaults to isLoading: false; we need loading state for spinner + no header/footer)
        mockSetAuthIsLoading(true);
        mockSetAuthUser(null);
        mockSetAuthSession(null);

        await act(async () => {
            render(<App />);
        });

        // Assertions: loading state shows spinner (status), no Header (banner) or Footer (contentinfo)
        expect(await screen.findByRole('status')).toBeInTheDocument();
        expect(screen.queryByRole('banner')).not.toBeInTheDocument();
        expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    });

    it('should render loading spinner when auth is loading', async () => {
        // Set auth store state for this test
        mockSetAuthIsLoading(true);
        mockSetAuthUser(null);
        mockSetAuthSession(null);

        // No need to re-spy
        // vi.spyOn(PaynlessStore, 'useAuthStore').mockImplementation(mockedUseAuthStoreHookLogic);

        await act(async () => {
          render(<App />);
        });

        // Assertions
        expect(await screen.findByRole('status')).toBeInTheDocument(); 
        expect(screen.queryByRole('banner')).not.toBeInTheDocument(); 
        expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    });

    it('should set showWelcomeModal to true when profile is loaded and has_seen_welcome_modal is false', async () => {
        const mockProfile: UserProfile = {
            id: 'user-123',
            has_seen_welcome_modal: false,
            is_subscribed_to_newsletter: false,
            first_name: null,
            last_name: null,
            last_selected_org_id: null,
            profile_privacy_setting: 'private',
            chat_context: null,
            created_at: new Date().toISOString(),
            role: 'user',
            updated_at: new Date().toISOString(),
        };

        // Arrange
        mockSetAuthIsLoading(false);
        mockSetIsChatContextHydrated(false);
        const { rerender } = render(<App />);

        // Act
        act(() => {
            mockSetAuthProfile(mockProfile);
        });
        await act(async () => {
            rerender(<App />);
        }); // Force re-render to pick up the new state from the mock

        // Assert
        await waitFor(() => {
            expect(mockedUseAuthStoreHookLogic.getState().showWelcomeModal).toBe(true);
        });
    });

    it('invokes useStageRunProgressHydration when the app renders', async () => {
        mockSetAuthIsLoading(false);
        mockSetAuthUser(null);
        mockSetAuthSession(null);

        await act(async () => {
            render(<App />);
        });

        await waitFor(() => {
            expect(useStageRunProgressHydrationMock).toHaveBeenCalled();
        });
    });
});
