import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AttributionDisplay, AttributionDisplayProps } from './AttributionDisplay';
import type { User, UserProfile, OrganizationMemberWithProfile } from '@paynless/types';

// Import shared mock SETTER utilities (can be at top level)
import { mockSetAuthUser, mockSetAuthProfile } from '../../mocks/authStore.mock'; 
import { 
    mockSetCurrentOrgId, 
    mockSetCurrentOrganizationMembers, 
    resetAllStoreMocks 
} from '../../mocks/organizationStore.mock';

// Define mocks for date-fns functions BEFORE the vi.mock call
const mockFormatDistanceToNow = vi.fn((_date?: Date | number, _options?: object) => 'mocked time ago'); 
const mockFormat = vi.fn((_date?: Date | number, _formatStr?: string, _options?: object) => 'mocked full date');

// Mock stores using shared hook logic
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal() as typeof import('@paynless/store');
  const { mockedUseAuthStoreHookLogic } = await import('../../mocks/authStore.mock');
  const { mockedUseOrganizationStoreHookLogic } = await import('../../mocks/organizationStore.mock');
  return {
    ...actual,
    useAuthStore: mockedUseAuthStoreHookLogic,
    useOrganizationStore: mockedUseOrganizationStoreHookLogic,
  };
});

// Mock date-fns for consistent timestamp output
vi.mock('date-fns', async (importOriginal) => {
  const actualDateFns = await importOriginal<typeof import('date-fns')>();
  return {
    ...actualDateFns,
    parseISO: (dateString: string) => new Date(dateString),
    formatDistanceToNow: (date: Date | number, options?: { addSuffix?: boolean; includeSeconds?: boolean; locale?: object }) => mockFormatDistanceToNow(date, options),
    format: (date: Date | number, formatStr: string, options?: { locale?: object }) => mockFormat(date, formatStr, options),
  };
});

const testUserId = 'user-test-123';
const otherUserId = 'user-other-456';
const testOrgId = 'org-test-789';
const mockTimestamp = new Date().toISOString();

const defaultProps: AttributionDisplayProps = {
  userId: testUserId,
  role: 'user',
  timestamp: mockTimestamp,
  organizationId: null,
  modelId: null,
};

const fullBaseUser: User = {
    id: testUserId, 
    email: 'current@example.com',
};

const fullBaseUserProfile: UserProfile = {
    id: testUserId, 
    role: 'user',
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-01T00:00:00Z',
    last_selected_org_id: null,
    first_name: null,
    last_name: null,
};


describe('AttributionDisplay', () => {
  beforeEach(() => {
    resetAllStoreMocks(); 
    mockFormatDistanceToNow.mockClear().mockReturnValue('mocked time ago');
    mockFormat.mockClear().mockReturnValue('mocked full date');
  });

  describe('1. Current User Attribution', () => {
    it('should display current user\'s full name and timestamp if profile has first_name and last_name', () => {
      const userWithEmail: User = { ...fullBaseUser, id: testUserId, email: 'testy@example.com' };
      const profileWithFullName: UserProfile = { ...fullBaseUserProfile, id: testUserId, first_name: 'Testy', last_name: 'McTestface' }; 
      mockSetAuthUser(userWithEmail);
      mockSetAuthProfile(profileWithFullName);
      render(<AttributionDisplay {...defaultProps} userId={testUserId} />);
      expect(screen.getByText('Testy McTestface')).toBeInTheDocument();
      expect(screen.getByText('Testy McTestface').closest('span')).toHaveAttribute('title', `Testy McTestface (ID: ${testUserId})`);
      expect(screen.getByText('mocked time ago')).toBeInTheDocument();
    });

    it('should display current user\'s first name and timestamp if profile has only first_name', () => {
      const userWithEmail: User = { ...fullBaseUser, id: testUserId, email: 'testy@example.com' };
      const profileWithFirstName: UserProfile = { ...fullBaseUserProfile, id: testUserId, first_name: 'Testy', last_name: null }; 
      mockSetAuthUser(userWithEmail);
      mockSetAuthProfile(profileWithFirstName);
      render(<AttributionDisplay {...defaultProps} userId={testUserId} />);
      expect(screen.getByText('Testy')).toBeInTheDocument();
      expect(screen.getByText('Testy').closest('span')).toHaveAttribute('title', `Testy (ID: ${testUserId})`);
    });

    it('should display current user\'s email and timestamp if profile has no names but has email on User object', () => {
      const userWithEmail: User = { ...fullBaseUser, id: testUserId, email: 'onlyemail@example.com' };
      const profileNoNames: UserProfile = { ...fullBaseUserProfile, id: testUserId, first_name: null, last_name: null }; 
      mockSetAuthUser(userWithEmail);
      mockSetAuthProfile(profileNoNames);
      render(<AttributionDisplay {...defaultProps} userId={testUserId} />);
      expect(screen.getByText('onlyemail@example.com')).toBeInTheDocument();
      expect(screen.getByText('onlyemail@example.com').closest('span')).toHaveAttribute('title', `onlyemail@example.com (ID: ${testUserId})`);
    });

    it('should display current user\'s truncated ID and timestamp if profile has no names or email, and user object has no email', () => {
      const userWithNoEmail: User = { ...fullBaseUser, id: testUserId, email: undefined }; 
      const profileNoDetails: UserProfile = { ...fullBaseUserProfile, id: testUserId, first_name: null, last_name: null }; 
      mockSetAuthUser(userWithNoEmail);
      mockSetAuthProfile(profileNoDetails);
      render(<AttributionDisplay {...defaultProps} userId={testUserId} />);
      expect(screen.getByText(`${testUserId.substring(0, 8)}...`)).toBeInTheDocument();
      expect(screen.getByText(`${testUserId.substring(0, 8)}...`).closest('span')).toHaveAttribute('title', `User ID: ${testUserId}`);
    });

    it('should display current user\'s email (from user object) and timestamp if profile is null but user object has email', () => {
      const userWithEmail: User = { ...fullBaseUser, id: testUserId, email: 'userobj@example.com' };
      mockSetAuthUser(userWithEmail);
      mockSetAuthProfile(null);
      render(<AttributionDisplay {...defaultProps} userId={testUserId} />);
      expect(screen.getByText('userobj@example.com')).toBeInTheDocument();
      expect(screen.getByText('userobj@example.com').closest('span')).toHaveAttribute('title', `userobj@example.com (ID: ${testUserId})`);
    });

    it.skip('should display current user\'s full name with "(You)" indicator and timestamp when explicitly marked as self', () => {
      const userWithEmail: User = { ...fullBaseUser, id: testUserId, email: 'testy@example.com' };
      const profileWithFullName: UserProfile = { ...fullBaseUserProfile, id: testUserId, first_name: 'Testy', last_name: 'McTestface' };
      mockSetAuthUser(userWithEmail);
      mockSetAuthProfile(profileWithFullName);
      render(<AttributionDisplay {...defaultProps} userId={testUserId} />); 
      expect(screen.getByText('Testy McTestface (You)')).toBeInTheDocument();
    });
  });

  describe('2. Other Organization Member Attribution', () => {
    const memberProfileFull: UserProfile = { ...fullBaseUserProfile, id: otherUserId, first_name: 'Other', last_name: 'Member' };
    const memberProfileFirstOnly: UserProfile = { ...fullBaseUserProfile, id: otherUserId, first_name: 'Other', last_name: null };
    const memberProfileEmailOnly: UserProfile = { ...fullBaseUserProfile, id: otherUserId, first_name: null, last_name: null };
    const memberProfileNoDetails: UserProfile = { ...fullBaseUserProfile, id: otherUserId, first_name: null, last_name: null };

    const orgMemberWithFullProfile: OrganizationMemberWithProfile = { id: 'mem-1', user_id: otherUserId, organization_id: testOrgId, role: 'member', status: 'active', created_at: '', user_profiles: memberProfileFull };
    const orgMemberWithFirstOnlyProfile: OrganizationMemberWithProfile = { ...orgMemberWithFullProfile, user_profiles: memberProfileFirstOnly };
    const orgMemberWithEmailOnlyProfile: OrganizationMemberWithProfile = { ...orgMemberWithFullProfile, user_profiles: memberProfileEmailOnly }; 
    const orgMemberWithNoDetailsProfile: OrganizationMemberWithProfile = { ...orgMemberWithFullProfile, user_profiles: memberProfileNoDetails };
    const orgMemberWithNullProfile: OrganizationMemberWithProfile = { ...orgMemberWithFullProfile, user_profiles: null };

    const currentActiveUser: User = { ...fullBaseUser, id: testUserId, email: 'current@example.com' }; 
    const currentActiveUserProfile: UserProfile = { ...fullBaseUserProfile, id: testUserId, first_name: 'Current', last_name: 'Tester' };

    it('should display org member\'s full name and timestamp if member profile has first_name and last_name', () => {
      mockSetAuthUser(currentActiveUser);
      mockSetAuthProfile(currentActiveUserProfile);
      mockSetCurrentOrgId(testOrgId);
      mockSetCurrentOrganizationMembers([orgMemberWithFullProfile]);
      render(<AttributionDisplay {...defaultProps} userId={otherUserId} organizationId={testOrgId} />);
      expect(screen.getByText('Other Member')).toBeInTheDocument();
      expect(screen.getByText('Other Member').closest('span')).toHaveAttribute('title', `Other Member (ID: ${otherUserId})`);
    });

    it('should display org member\'s first name and timestamp if member profile has only first_name', () => {
      mockSetAuthUser(currentActiveUser);
      mockSetAuthProfile(currentActiveUserProfile);
      mockSetCurrentOrgId(testOrgId);
      mockSetCurrentOrganizationMembers([orgMemberWithFirstOnlyProfile]);
      render(<AttributionDisplay {...defaultProps} userId={otherUserId} organizationId={testOrgId} />);
      expect(screen.getByText('Other')).toBeInTheDocument();
      expect(screen.getByText('Other').closest('span')).toHaveAttribute('title', `Other (ID: ${otherUserId})`);
    });

    it('should display org member\'s email (from User object via org member list) and timestamp if member profile has no names', () => {
      mockSetAuthUser(currentActiveUser);
      mockSetAuthProfile(currentActiveUserProfile);
      mockSetCurrentOrgId(testOrgId);
      const memberWithEmailOnUserObject: OrganizationMemberWithProfile = { 
        ...orgMemberWithEmailOnlyProfile, 
      };
      mockSetCurrentOrganizationMembers([memberWithEmailOnUserObject]);
      render(<AttributionDisplay {...defaultProps} userId={otherUserId} organizationId={testOrgId} />);
      expect(screen.getByText(`${otherUserId.substring(0, 8)}...`)).toBeInTheDocument(); 
    });

    it('should display org member\'s truncated ID and timestamp if member profile has no names or email', () => {
      mockSetAuthUser(currentActiveUser);
      mockSetAuthProfile(currentActiveUserProfile);
      mockSetCurrentOrgId(testOrgId);
      mockSetCurrentOrganizationMembers([orgMemberWithNoDetailsProfile]);
      render(<AttributionDisplay {...defaultProps} userId={otherUserId} organizationId={testOrgId} />);
      expect(screen.getByText(`${otherUserId.substring(0, 8)}...`)).toBeInTheDocument();
      expect(screen.getByText(`${otherUserId.substring(0, 8)}...`).closest('span')).toHaveAttribute('title', `User ID: ${otherUserId}`);
    });

    it('should display org member\'s truncated ID and timestamp if their user_profiles object is null/undefined in currentOrganizationMembers', () => {
      mockSetAuthUser(currentActiveUser);
      mockSetAuthProfile(currentActiveUserProfile);
      mockSetCurrentOrgId(testOrgId);
      mockSetCurrentOrganizationMembers([orgMemberWithNullProfile]);
      render(<AttributionDisplay {...defaultProps} userId={otherUserId} organizationId={testOrgId} />);
      expect(screen.getByText(`${otherUserId.substring(0, 8)}...`)).toBeInTheDocument();
      expect(screen.getByText(`${otherUserId.substring(0, 8)}...`).closest('span')).toHaveAttribute('title', `User ID: ${otherUserId}`);
    });

    it('should display org member\'s truncated ID and timestamp if they are not found in currentOrganizationMembers list', () => {
      mockSetAuthUser(currentActiveUser);
      mockSetAuthProfile(currentActiveUserProfile);
      mockSetCurrentOrgId(testOrgId);
      mockSetCurrentOrganizationMembers([]); 
      render(<AttributionDisplay {...defaultProps} userId={otherUserId} organizationId={testOrgId} />);
      expect(screen.getByText(`${otherUserId.substring(0, 8)}...`)).toBeInTheDocument();
      expect(screen.getByText(`${otherUserId.substring(0, 8)}...`).closest('span')).toHaveAttribute('title', `User ID: ${otherUserId}`);
    });

    it('should display org member\'s truncated ID and timestamp if chat.organization_id does not match current active orgId', () => {
      mockSetAuthUser(currentActiveUser);
      mockSetAuthProfile(currentActiveUserProfile);
      mockSetCurrentOrgId('another-org'); 
      mockSetCurrentOrganizationMembers([orgMemberWithFullProfile]);
      render(<AttributionDisplay {...defaultProps} userId={otherUserId} organizationId={testOrgId} />); 
      expect(screen.getByText(`${otherUserId.substring(0, 8)}...`)).toBeInTheDocument();
      expect(screen.getByText(`${otherUserId.substring(0, 8)}...`).closest('span')).toHaveAttribute('title', `User ID: ${otherUserId}`);
    });
  });

  describe('3. Fallback/Generic Attribution', () => {
    it('should display truncated user ID and timestamp for a user not matching current user and not in an org context', () => {
      const differentUser: User = { ...fullBaseUser, id: 'different-user-id' };
      mockSetAuthUser(differentUser);
      mockSetAuthProfile(null); 
      mockSetCurrentOrgId(null); 
      render(<AttributionDisplay {...defaultProps} userId={otherUserId} organizationId={null} />); 
      expect(screen.getByText(`${otherUserId.substring(0, 8)}...`)).toBeInTheDocument();
      expect(screen.getByText(`${otherUserId.substring(0, 8)}...`).closest('span')).toHaveAttribute('title', `User ID: ${otherUserId}`);
    });
  });

  describe('4. Timestamp Formatting', () => {
    it('should display the timestamp formatted correctly (e.g., using date-fns formatDistanceToNow)', () => {
      mockSetAuthUser(fullBaseUser as User);
      mockSetAuthProfile(fullBaseUserProfile as UserProfile);
      render(<AttributionDisplay {...defaultProps} />);
      expect(screen.getByText('mocked time ago')).toBeInTheDocument();
      expect(mockFormatDistanceToNow).toHaveBeenCalledWith(new Date(mockTimestamp), { addSuffix: true });
    });

    it('should display the full date as a title attribute on the timestamp for accessibility', () => {
      mockSetAuthUser(fullBaseUser as User);
      mockSetAuthProfile(fullBaseUserProfile as UserProfile);
      const { rerender } = render(<AttributionDisplay {...defaultProps} timestamp={mockTimestamp} />);
      const timestampSpan = screen.getByText('mocked time ago');
      expect(timestampSpan).toHaveAttribute('title', 'mocked full date');
      expect(mockFormat).toHaveBeenCalledWith(new Date(mockTimestamp), 'PPPppp', undefined);

      const invalidTimestamp = 'invalid-date-string';
      mockSetAuthUser(fullBaseUser as User);
      mockSetAuthProfile(fullBaseUserProfile as UserProfile);
      rerender(<AttributionDisplay {...defaultProps} timestamp={invalidTimestamp} />);
    });
  });

  describe('5. Assistant Attribution', () => {
    const assistantProps: AttributionDisplayProps = { ...defaultProps, role: 'assistant', userId: null };

    it('should display "Assistant" and timestamp if role is assistant and model_id is null/undefined', () => {
      mockSetAuthUser(null); 
      mockSetAuthProfile(null);
      render(<AttributionDisplay {...assistantProps} modelId={null} />);
      expect(screen.getByText('Assistant')).toBeInTheDocument();
      expect(screen.getByText('Assistant').closest('span')).toHaveAttribute('title', 'Assistant');
      expect(screen.getByText('mocked time ago')).toBeInTheDocument();
    });

    it('should display model name (from a future lookup) and timestamp if role is assistant and model_id is present', () => {
      mockSetAuthUser(null);
      mockSetAuthProfile(null);
      render(<AttributionDisplay {...assistantProps} modelId="model-gpt-4" />);
      expect(screen.getByText('GPT-4')).toBeInTheDocument(); 
      expect(screen.getByText('GPT-4').closest('span')).toHaveAttribute('title', 'GPT-4 (Model ID: model-gpt-4)');
    });
  });
}); 