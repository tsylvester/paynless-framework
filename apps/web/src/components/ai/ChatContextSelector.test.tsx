import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi } from 'vitest';
import { ChatContextSelector } from '@/components/ai/ChatContextSelector'; // Adjust path as needed
import type { Organization } from '@paynless/types'; // Adjust path as needed
import { useOrganizationStore } from '@paynless/store';

// Mock scrollIntoView for Radix components in JSDOM
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
}

// Mock @paynless/store
vi.mock('@paynless/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@paynless/store')>();
  return {
    ...actual,
    useOrganizationStore: vi.fn(),
  };
});

const mockUseOrganizationStore = vi.mocked(useOrganizationStore);

// Mock shadcn/ui Select component
// jest.mock('@/components/ui/select', () => ({
//   Select: ({ children, onValueChange, value, disabled }: any) => (
//     <select 
//       data-testid="select-mock" 
//       value={value} 
//       onChange={(e) => onValueChange(e.target.value)} 
//       disabled={disabled}
//     >
//       {children}
//     </select>
//   ),
//   SelectTrigger: ({ children }: any) => <div data-testid="select-trigger-mock">{children}</div>,
//   SelectValue: ({ placeholder }: any) => <span data-testid="select-value-mock">{placeholder}</span>,
//   SelectContent: ({ children }: any) => <div data-testid="select-content-mock">{children}</div>,
//   SelectItem: ({ children, value }: any) => <option data-testid={`select-item-mock-${value}`} value={value}>{children}</option>,
// }));

// A more robust mock for shadcn/ui Select that handles opening/closing and item selection
const mockOrganizations: Organization[] = [
  {
    id: 'org_1',
    name: 'Org One',
    created_at: '2023-01-01T00:00:00Z',
    allow_member_chat_creation: true,
    visibility: 'private',
    deleted_at: null,
  },
  {
    id: 'org_2',
    name: 'Org Two',
    created_at: '2023-01-02T00:00:00Z',
    allow_member_chat_creation: false,
    visibility: 'public',
    deleted_at: null,
  },
];

describe('ChatContextSelector', () => {
  const onContextChangeMock = vi.fn();
  const mockUserOrganizations: Organization[] = [
    {
      id: 'org_1',
      name: 'Org One',
      created_at: '2023-01-01T00:00:00Z',
      allow_member_chat_creation: true,
      visibility: 'private',
      deleted_at: null,
    },
    {
      id: 'org_2',
      name: 'Org Two',
      created_at: '2023-01-02T00:00:00Z',
      allow_member_chat_creation: false,
      visibility: 'public',
      deleted_at: null,
    },
  ];

  beforeEach(() => {
    onContextChangeMock.mockClear();
    // Default mock implementation
    mockUseOrganizationStore.mockReturnValue({
      userOrganizations: [],
      isLoading: false,
      // Add other state properties and actions if ChatContextSelector uses them
      // For now, assuming it only uses userOrganizations and isLoading
    } as any); // Use 'as any' for simplicity if full type is complex
  });

  it('renders the Select component with placeholder', () => {
    mockUseOrganizationStore.mockReturnValue({
      userOrganizations: [],
      isLoading: false,
    } as any);
    render(
      <ChatContextSelector
        currentContextId={null}
        onContextChange={onContextChangeMock}
        // isLoading is now from the store
      />
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders "Personal" option in the dropdown by default', async () => {
    mockUseOrganizationStore.mockReturnValue({
      userOrganizations: [],
      isLoading: false,
    } as any);
    render(
      <ChatContextSelector
        currentContextId={null}
        onContextChange={onContextChangeMock}
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    expect(await within(listbox).findByText('Personal')).toBeInTheDocument();
  });

  it('renders organization names from props in the dropdown', async () => {
    mockUseOrganizationStore.mockReturnValue({
      userOrganizations: mockUserOrganizations,
      isLoading: false,
    } as any);
    render(
      <ChatContextSelector
        currentContextId={null}
        onContextChange={onContextChangeMock}
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    expect(await within(listbox).findByText('Org One')).toBeInTheDocument();
    expect(await within(listbox).findByText('Org Two')).toBeInTheDocument();
  });

  it('displays the correct value when currentContextId is "Personal" (null)', () => {
    mockUseOrganizationStore.mockReturnValue({
      userOrganizations: mockUserOrganizations,
      isLoading: false,
    } as any);
    render(
      <ChatContextSelector
        currentContextId={null} // "Personal"
        onContextChange={onContextChangeMock}
      />
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('Personal');
  });

  it('displays the correct value when currentContextId is an org ID', () => {
    mockUseOrganizationStore.mockReturnValue({
      userOrganizations: mockUserOrganizations,
      isLoading: false,
    } as any);
    render(
      <ChatContextSelector
        currentContextId={'org_1'}
        onContextChange={onContextChangeMock}
      />
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('Org One');
  });

  it('calls onContextChange with null when "Personal" option is selected', async () => {
    mockUseOrganizationStore.mockReturnValue({
      userOrganizations: mockUserOrganizations,
      isLoading: false,
    } as any);
    render(
      <ChatContextSelector
        currentContextId={'org_1'} // Start with an org selected
        onContextChange={onContextChangeMock}
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    const personalOption = await within(listbox).findByText('Personal');
    fireEvent.click(personalOption);
    expect(onContextChangeMock).toHaveBeenCalledWith(null);
  });

  it('calls onContextChange with orgId when an organization option is selected', async () => {
    mockUseOrganizationStore.mockReturnValue({
      userOrganizations: mockUserOrganizations,
      isLoading: false,
    } as any);
    render(
      <ChatContextSelector
        currentContextId={null} // Start with "Personal"
        onContextChange={onContextChangeMock}
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    const orgOneOption = await within(listbox).findByText('Org One');
    fireEvent.click(orgOneOption);
    expect(onContextChangeMock).toHaveBeenCalledWith('org_1');
  });

  it('disables the select when isLoading is true', () => {
    mockUseOrganizationStore.mockReturnValue({
      userOrganizations: mockUserOrganizations,
      isLoading: true, // Set isLoading to true
    } as any);
    render(
      <ChatContextSelector
        currentContextId={null}
        onContextChange={onContextChangeMock}
      />
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('handles empty state (still shows "Personal" option in dropdown)', async () => {
    mockUseOrganizationStore.mockReturnValue({
      userOrganizations: [], // Empty organizations
      isLoading: false,
    } as any);
    render(
      <ChatContextSelector
        currentContextId={null}
        onContextChange={onContextChangeMock}
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    expect(await within(listbox).findByText('Personal')).toBeInTheDocument();
    // Check that organization options are not present
    expect(within(listbox).queryByText('Org One')).not.toBeInTheDocument();
  });

  it('shows a loading placeholder in the trigger when isLoading is true', () => {
    mockUseOrganizationStore.mockReturnValue({
      userOrganizations: [],
      isLoading: true, // Set isLoading to true
    } as any);
    render(
      <ChatContextSelector
        currentContextId={null}
        onContextChange={onContextChangeMock}
      />
    );
    expect(screen.getByRole('combobox')).toHaveTextContent(/loading contexts.../i);
  });
}); 