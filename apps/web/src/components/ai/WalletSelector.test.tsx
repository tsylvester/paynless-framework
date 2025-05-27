// Test file for WalletSelector
import { render, screen } from '@testing-library/react';
import { vi, describe, beforeEach, test, expect, type MockedFunction } from 'vitest';
import { WalletSelector, WalletSelectorProps } from './WalletSelector';
import { useChatWalletDecision } from '@/hooks/useChatWalletDecision';
import { TokenWallet, ApiError, Organization } from '@paynless/types';

// Import mock utilities from walletStoreMock
import { 
    initializeMockWalletStore,
    mockGetOrLoadOrganizationWallet,
} from '@/mocks/walletStore.mock';

// Import mock utilities from organizationStore.mock
import { 
    mockSetUserOrganizations
} from '@/mocks/organizationStore.mock';

// Define default mock organizations for this test file
const defaultMockUserOrganizations: Organization[] = [
    { 
        id: 'org-123', 
        name: 'Mock Org Alpha', 
        created_at: new Date().toISOString(), 
        visibility: 'private', 
        allow_member_chat_creation: true, 
        deleted_at: null, 
        token_usage_policy: 'member_tokens' 
    },
    { 
        id: 'org-456', 
        name: 'Mock Org Beta', 
        created_at: new Date().toISOString(), 
        visibility: 'private', 
        allow_member_chat_creation: false, 
        deleted_at: null, 
        token_usage_policy: 'organization_tokens' 
    },
];

// Mock the hooks using Vitest
vi.mock('@/hooks/useChatWalletDecision');
const mockUseChatWalletDecision = useChatWalletDecision as MockedFunction<typeof useChatWalletDecision>;

vi.mock('@paynless/store', async () => {
    const walletMock = await vi.importActual<typeof import('@/mocks/walletStore.mock')>('@/mocks/walletStoreMock');
    const orgMock = await vi.importActual<typeof import('@/mocks/organizationStore.mock')>('@/mocks/organizationStore.mock');
    return { 
      ...walletMock, 
      ...orgMock 
    };
});

const defaultProps: WalletSelectorProps = {
  // if WalletSelector takes props, define them here
};

describe('WalletSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Clears all mocks, including those from walletStoreMock

    // Initialize the mock wallet store state before each test
    // You can pass initial overrides if a specific test needs a different starting state
    initializeMockWalletStore(); 
    // Set user organizations using the imported setter
    mockSetUserOrganizations(defaultMockUserOrganizations);

    mockUseChatWalletDecision.mockReturnValue({
      effectiveOutcome: { outcome: 'loading' },
      giveConsent: vi.fn(),
      refuseConsent: vi.fn(),
      isLoadingConsent: false,
      resetConsent: vi.fn(),
    });
  });

  test('renders loading state from useChatWalletDecision', () => {
    render(<WalletSelector {...defaultProps} />);
    expect(screen.getByText(/Status:/i)).toBeInTheDocument();
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
  });

  describe('Personal Wallet Scenarios', () => {
    test('renders personal wallet balance when outcome is use_personal_wallet', async () => {
      const personalWalletData: TokenWallet = { 
        walletId: 'personal-id', 
        balance: '1000', 
        currency: 'AI_TOKEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      // Directly update the state via the imported mock store's functions or by re-initializing
      // For this example, we'll re-initialize with the specific state needed.
      initializeMockWalletStore({
        personalWallet: personalWalletData,
        isLoadingPersonalWallet: false,
      });

      mockUseChatWalletDecision.mockReturnValue({
        effectiveOutcome: { outcome: 'use_personal_wallet' },
        giveConsent: vi.fn(),
        refuseConsent: vi.fn(),
        isLoadingConsent: false,
        resetConsent: vi.fn(),
      });

      render(<WalletSelector {...defaultProps} />);
      expect(await screen.findByText(/Personal:/i)).toBeInTheDocument();
      expect(await screen.findByText(/1\.0K/i)).toBeInTheDocument();
    });

    test('renders personal wallet loading state', async () => {
      initializeMockWalletStore({
        personalWallet: null,
        isLoadingPersonalWallet: true,
      });

      mockUseChatWalletDecision.mockReturnValue({
          effectiveOutcome: { outcome: 'use_personal_wallet' },
          giveConsent: vi.fn(),
          refuseConsent: vi.fn(),
          isLoadingConsent: false,
          resetConsent: vi.fn(),
        });

      render(<WalletSelector {...defaultProps} />);
      expect(await screen.findByText(/Personal:/i)).toBeInTheDocument();
      expect(await screen.findByText(/Loading.../i)).toBeInTheDocument();
    });

    test('renders personal wallet error state', async () => {
      const errorMsg = 'Failed to load personal wallet';
      const error: ApiError = { message: errorMsg, code: 'PERSONAL_WALLET_LOAD_ERROR' };
      initializeMockWalletStore({
        personalWalletError: error,
        isLoadingPersonalWallet: false,
        personalWallet: null,
      });
  
      mockUseChatWalletDecision.mockReturnValue({
          effectiveOutcome: { outcome: 'use_personal_wallet' }, 
          giveConsent: vi.fn(),
          refuseConsent: vi.fn(),
          isLoadingConsent: false,
          resetConsent: vi.fn(),
        });
  
      render(<WalletSelector {...defaultProps} />);
      expect(await screen.findByText(/Personal:/i)).toBeInTheDocument();
      expect(await screen.findByText(new RegExp(errorMsg, 'i'))).toBeInTheDocument();
    });
  });

  describe('Organization Wallet Scenarios', () => {
    const orgId = 'org-123';
    const orgName = 'Mock Org Alpha';

    test('renders organization wallet balance when outcome is use_organization_wallet', async () => {
      const orgWalletData: TokenWallet = { 
        walletId: 'org-wallet-id', 
        balance: '5000000',
        currency: 'AI_TOKEN', 
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      initializeMockWalletStore({
        organizationWallets: { [orgId]: orgWalletData },
        isLoadingOrgWallet: { [orgId]: false },
      });

      mockUseChatWalletDecision.mockReturnValue({
        effectiveOutcome: { outcome: 'use_organization_wallet', orgId },
        giveConsent: vi.fn(),
        refuseConsent: vi.fn(),
        isLoadingConsent: false,
        resetConsent: vi.fn(),
      });

      render(<WalletSelector {...defaultProps} />);
      expect(await screen.findByText(new RegExp(`${orgName}:`, 'i'))).toBeInTheDocument();
      expect(await screen.findByText(/5\.0M/i)).toBeInTheDocument();
      expect(mockGetOrLoadOrganizationWallet).not.toHaveBeenCalled(); 
    });

    test('renders organization wallet loading state if isLoadingOrgWallet is true', async () => {
        initializeMockWalletStore({
            organizationWallets: { [orgId]: null }, 
            isLoadingOrgWallet: { [orgId]: true },
        });
  
        mockUseChatWalletDecision.mockReturnValue({
          effectiveOutcome: { outcome: 'use_organization_wallet', orgId },
          giveConsent: vi.fn(),
          refuseConsent: vi.fn(),
          isLoadingConsent: false,
          resetConsent: vi.fn(),
        });
  
        render(<WalletSelector {...defaultProps} />);
        expect(await screen.findByText(new RegExp(`${orgName}:`, 'i'))).toBeInTheDocument();
        expect(await screen.findByText(/Loading.../i)).toBeInTheDocument();
      });
    
    test('calls getOrLoadOrganizationWallet if org wallet not present and not initially loading', async () => {
        initializeMockWalletStore({
            organizationWallets: {}, 
            isLoadingOrgWallet: { [orgId]: false },
        });
  
        mockGetOrLoadOrganizationWallet.mockResolvedValue(null as unknown as TokenWallet);
  
        mockUseChatWalletDecision.mockReturnValue({
          effectiveOutcome: { outcome: 'use_organization_wallet', orgId },
          giveConsent: vi.fn(),
          refuseConsent: vi.fn(),
          isLoadingConsent: false,
          resetConsent: vi.fn(),
        });
  
        render(<WalletSelector {...defaultProps} />); 
        expect(mockGetOrLoadOrganizationWallet).toHaveBeenCalledWith(orgId);
      });

    test('renders organization wallet error state', async () => {
      const errorMsg = 'Failed to load org wallet';
      const error: ApiError = { message: errorMsg, code: 'ORG_WALLET_LOAD_ERROR' };
      initializeMockWalletStore({
        orgWalletErrors: { [orgId]: error },
        isLoadingOrgWallet: { [orgId]: false },
        organizationWallets: { [orgId]: null }, 
      });

      mockUseChatWalletDecision.mockReturnValue({
        effectiveOutcome: { outcome: 'use_organization_wallet', orgId },
        giveConsent: vi.fn(),
        refuseConsent: vi.fn(),
        isLoadingConsent: false,
        resetConsent: vi.fn(),
      });

      render(<WalletSelector {...defaultProps} />);
      expect(await screen.findByText(new RegExp(`${orgName}:`, 'i'))).toBeInTheDocument();
      expect(await screen.findByText(new RegExp(errorMsg, 'i'))).toBeInTheDocument();
    });

    test('renders N/A if org wallet is null, not loading, and no error', async () => {
        initializeMockWalletStore({
            organizationWallets: { [orgId]: null },
            isLoadingOrgWallet: { [orgId]: false },
            orgWalletErrors: { [orgId]: null },
        });
  
        mockUseChatWalletDecision.mockReturnValue({
          effectiveOutcome: { outcome: 'use_organization_wallet', orgId },
          giveConsent: vi.fn(),
          refuseConsent: vi.fn(),
          isLoadingConsent: false,
          resetConsent: vi.fn(),
        });
  
        render(<WalletSelector {...defaultProps} />);
        expect(await screen.findByText(new RegExp(`${orgName}:`, 'i'))).toBeInTheDocument();
        expect(await screen.findByText(/N\/A/i)).toBeInTheDocument();
      });

  });

}); 