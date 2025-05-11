import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatContextSelector } from './ChatContextSelector';
import type { Organization, OrganizationState, OrganizationUIState } from '@paynless/types';
import { vi, beforeEach, afterEach } from 'vitest';

// Mock logger
vi.mock('@paynless/utils', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));

// Polyfill for PointerEvents
if (typeof window !== 'undefined') {
    class MockPointerEvent extends Event {
        button: number;
        ctrlKey: boolean;
        pointerType: string;
        pointerId: number; // Added pointerId

        constructor(type: string, props: PointerEventInit) {
            super(type, props);
            this.button = props.button || 0;
            this.ctrlKey = props.ctrlKey || false;
            this.pointerType = props.pointerType || 'mouse';
            this.pointerId = props.pointerId || 0; // Initialize pointerId
        }
    }
    // @ts-expect-error // window.PointerEvent is read-only
    window.PointerEvent = MockPointerEvent;

    if (!HTMLElement.prototype.hasPointerCapture) {
        HTMLElement.prototype.hasPointerCapture = (pointerId: number) => {
            // console.warn('[Test Polyfill] hasPointerCapture called with', pointerId);
            // Add mock logic if needed, for now, it can be a no-op or return false
            if (process.env['NODE_ENV'] === 'test') { // only log in test environment
                console.log(`[Test Polyfill] hasPointerCapture: ${pointerId}`);
            }
            return false; 
        };
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
        HTMLElement.prototype.releasePointerCapture = (pointerId: number) => {
            // console.warn('[Test Polyfill] releasePointerCapture called with', pointerId);
            // Add mock logic if needed
            if (process.env['NODE_ENV'] === 'test') {
                console.log(`[Test Polyfill] releasePointerCapture: ${pointerId}`);
            }
        };
    }
    if (!HTMLElement.prototype.setPointerCapture) { // Added setPointerCapture
        HTMLElement.prototype.setPointerCapture = (pointerId: number) => {
            // console.warn('[Test Polyfill] setPointerCapture called with', pointerId);
            // Add mock logic if needed
            if (process.env['NODE_ENV'] === 'test') {
                console.log(`[Test Polyfill] setPointerCapture: ${pointerId}`);
            }
        };
    }
}


// Mock Zustand stores
const mockSetNewChatContext = vi.fn();
let mockNewChatContext: string | null = null;

const mockUserOrganizations: Organization[] = [
    { id: 'org1', name: 'Organization 1', created_at: 'test', visibility: 'private', allow_member_chat_creation: true, deleted_at: null },
    { id: 'org2', name: 'Organization 2', created_at: 'test', visibility: 'private', allow_member_chat_creation: true, deleted_at: null },
];
let mockIsOrgLoading = false;

vi.mock('@paynless/store', async (importOriginal) => {
    const actual = await importOriginal() as typeof import('@paynless/store');
    return {
        ...actual,
        useAiStore: vi.fn((selector) => {
            const state = {
                ...actual.initialAiStateValues, // Ensure this is the correct initial state object name from the store
                newChatContext: mockNewChatContext,
                setNewChatContext: mockSetNewChatContext,
            };
            return selector(state);
        }),
        useOrganizationStore: vi.fn((selector) => {
            // Define all properties for OrganizationState & OrganizationUIState
            const state: OrganizationState & OrganizationUIState = {
                userOrganizations: mockUserOrganizations,
                isLoading: mockIsOrgLoading,
                // Provide default/mock values for all other properties of OrganizationState
                currentOrganizationId: null,
                currentOrganizationDetails: null,
                currentOrganizationMembers: [],
                memberCurrentPage: 1,
                memberPageSize: 10,
                memberTotalCount: 0,
                currentPendingInvites: [],
                currentPendingRequests: [],
                currentInviteDetails: null,
                fetchInviteDetailsError: null,
                error: null,
                orgListPage: 1,
                orgListPageSize: 10,
                orgListTotalCount: 0,
                isFetchingInviteDetails: false,
                // Provide default/mock values for all other properties of OrganizationUIState
                isCreateModalOpen: false,
                isDeleteDialogOpen: false,
            };
            return selector(state);
        }),
    };
});

describe('ChatContextSelector', () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView; // Store original

    beforeEach(() => {
        vi.clearAllMocks();
        mockNewChatContext = null;
        mockIsOrgLoading = false;
        HTMLElement.prototype.scrollIntoView = vi.fn(); // Mock scrollIntoView
    });

    afterEach(() => {
        HTMLElement.prototype.scrollIntoView = originalScrollIntoView; // Restore original
    });

    it('renders with "Personal" selected by default if store state is null', () => {
        mockNewChatContext = null;
        render(<ChatContextSelector />);
        expect(screen.getByText('Personal')).toBeInTheDocument();
    });

    it('renders with the correct organization name selected based on store state', () => {
        mockNewChatContext = 'org1';
        render(<ChatContextSelector />);
        expect(screen.getByText('Organization 1')).toBeInTheDocument();
    });
    
    it('renders "Select context" if store state is an orgId not in userOrganizations (fallback)', () => {
        mockNewChatContext = 'org-unknown';
        render(<ChatContextSelector />);
        expect(screen.getByText('Select context')).toBeInTheDocument();
    });


    it('calls setNewChatContext with null when "Personal" is selected', async () => {
        const user = userEvent.setup();
        mockNewChatContext = 'org1';
        render(<ChatContextSelector />);
        const trigger = screen.getByRole('combobox');
        await user.click(trigger);

        const personalOption = await screen.findByRole('option', { name: 'Personal' });
        await user.click(personalOption);

        expect(mockSetNewChatContext).toHaveBeenCalledWith(null);
    });

    it('calls setNewChatContext with the orgId when an organization is selected', async () => {
        const user = userEvent.setup();
        render(<ChatContextSelector />);
        const trigger = screen.getByRole('combobox');
        await user.click(trigger);

        const orgOption = await screen.findByRole('option', { name: 'Organization 1' });
        await user.click(orgOption);
        
        expect(mockSetNewChatContext).toHaveBeenCalledWith('org1');
    });

    it('displays "Loading contexts..." when organization data is loading', () => {
        mockIsOrgLoading = true;
        render(<ChatContextSelector />);
        expect(screen.getByText('Loading contexts...')).toBeInTheDocument();
        expect(screen.getByRole('combobox')).toBeDisabled();
    });

    it('is disabled when the disabled prop is true', () => {
        render(<ChatContextSelector disabled={true} />);
        expect(screen.getByRole('combobox')).toBeDisabled();
    });
    
    it('renders all organizations from the store', async () => {
        const user = userEvent.setup();
        render(<ChatContextSelector />);
        const trigger = screen.getByRole('combobox');
        await user.click(trigger); 

        expect(await screen.findByRole('option', { name: 'Personal' })).toBeInTheDocument();
        expect(await screen.findByRole('option', { name: 'Organization 1' })).toBeInTheDocument();
        expect(await screen.findByRole('option', { name: 'Organization 2' })).toBeInTheDocument();
    });
}); 