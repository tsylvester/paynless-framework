import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatContextSelector } from './ChatContextSelector';
import { useAiStore, initialAiStateValues as aiStoreInitialState } from '@paynless/store';
import { useOrganizationStore, initialOrganizationState } from '@paynless/store';
import type { Organization } from '@paynless/types';
import { vi } from 'vitest';

// Mock logger
vi.mock('@paynless/utils', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    },
}));


// Mock Zustand stores
const mockSetSelectedChatContextForNewChat = vi.fn();
let mockSelectedChatContextForNewChat: string | null = null;

const mockUserOrganizations: Organization[] = [
    { id: 'org1', name: 'Organization 1', created_at: 'test', updated_at: 'test', user_id: 'u1', visibility: 'private' },
    { id: 'org2', name: 'Organization 2', created_at: 'test', updated_at: 'test', user_id: 'u1', visibility: 'private' },
];
let mockIsOrgLoading = false;

vi.mock('@paynless/store', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        useAiStore: vi.fn((selector) => {
            const state = {
                ...actual.initialAiStateValues, // Ensure this is the correct initial state object name from the store
                selectedChatContextForNewChat: mockSelectedChatContextForNewChat,
                setSelectedChatContextForNewChat: mockSetSelectedChatContextForNewChat,
            };
            return selector(state);
        }),
        useOrganizationStore: vi.fn((selector) => {
            const state = {
                ...actual.initialOrganizationState, // Ensure this is the correct initial state object name
                userOrganizations: mockUserOrganizations,
                isLoading: mockIsOrgLoading,
            };
            return selector(state);
        }),
    };
});

const PERSONAL_CONTEXT_ID = '__personal__'; // As defined in ChatContextSelector.tsx

describe('ChatContextSelector', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSelectedChatContextForNewChat = null;
        mockIsOrgLoading = false;
    });

    it('renders with "Personal" selected by default if store state is null', () => {
        mockSelectedChatContextForNewChat = null;
        render(<ChatContextSelector />);
        expect(screen.getByText('Personal')).toBeInTheDocument();
    });

    it('renders with the correct organization name selected based on store state', () => {
        mockSelectedChatContextForNewChat = 'org1';
        render(<ChatContextSelector />);
        expect(screen.getByText('Organization 1')).toBeInTheDocument();
    });
    
    it('renders "Select context" if store state is an orgId not in userOrganizations (fallback)', () => {
        mockSelectedChatContextForNewChat = 'org-unknown';
        render(<ChatContextSelector />);
        expect(screen.getByText('Select context')).toBeInTheDocument();
    });


    it('calls setSelectedChatContextForNewChat with null when "Personal" is selected', async () => {
        render(<ChatContextSelector />);
        const trigger = screen.getByRole('combobox');
        fireEvent.mouseDown(trigger); 

        await waitFor(() => {
            // Use a more robust selector if plain text is ambiguous or part of the trigger itself
            expect(screen.getByText('Personal', { selector: '[role="option"]' })).toBeInTheDocument();
        });
        
        const personalOption = screen.getByText('Personal', { selector: '[role="option"]' });
        fireEvent.click(personalOption);

        expect(mockSetSelectedChatContextForNewChat).toHaveBeenCalledWith(null);
    });

    it('calls setSelectedChatContextForNewChat with the orgId when an organization is selected', async () => {
        render(<ChatContextSelector />);
        const trigger = screen.getByRole('combobox');
        fireEvent.mouseDown(trigger);

        await waitFor(() => {
           expect(screen.getByText('Organization 1', { selector: '[role="option"]' })).toBeInTheDocument();
        });
        
        const orgOption = screen.getByText('Organization 1', { selector: '[role="option"]' });
        fireEvent.click(orgOption);
        
        expect(mockSetSelectedChatContextForNewChat).toHaveBeenCalledWith('org1');
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
        render(<ChatContextSelector />);
        const trigger = screen.getByRole('combobox');
        fireEvent.mouseDown(trigger); 

        await waitFor(() => {
            expect(screen.getByText('Personal', { selector: '[role="option"]' })).toBeInTheDocument();
            expect(screen.getByText('Organization 1', { selector: '[role="option"]' })).toBeInTheDocument();
            expect(screen.getByText('Organization 2', { selector: '[role="option"]' })).toBeInTheDocument();
        });
    });
}); 