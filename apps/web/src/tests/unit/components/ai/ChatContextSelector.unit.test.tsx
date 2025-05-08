import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi } from 'vitest';
import { ChatContextSelector } from '@/components/ai/ChatContextSelector'; // Adjust path as needed
import type { Organization } from '@paynless/types'; // Adjust path as needed

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

  beforeEach(() => {
    onContextChangeMock.mockClear();
  });

  it('renders the Select component with placeholder', () => {
    render(
      <ChatContextSelector
        organizations={[]}
        currentContextId={null}
        onContextChange={onContextChangeMock}
        isLoading={false}
      />
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders "Personal" option in the dropdown by default', async () => {
    render(
      <ChatContextSelector
        organizations={[]}
        currentContextId={null}
        onContextChange={onContextChangeMock}
        isLoading={false}
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    expect(await within(listbox).findByText('Personal')).toBeInTheDocument();
  });

  it('renders organization names from props in the dropdown', async () => {
    render(
      <ChatContextSelector
        organizations={mockOrganizations}
        currentContextId={null}
        onContextChange={onContextChangeMock}
        isLoading={false}
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    expect(await within(listbox).findByText('Org One')).toBeInTheDocument();
    expect(await within(listbox).findByText('Org Two')).toBeInTheDocument();
  });

  it('displays the correct value when currentContextId is "Personal" (null)', () => {
    render(
      <ChatContextSelector
        organizations={mockOrganizations}
        currentContextId={null} // "Personal"
        onContextChange={onContextChangeMock}
        isLoading={false}
      />
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('Personal');
  });

  it('displays the correct value when currentContextId is an org ID', () => {
    render(
      <ChatContextSelector
        organizations={mockOrganizations}
        currentContextId={'org_1'}
        onContextChange={onContextChangeMock}
        isLoading={false}
      />
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('Org One');
  });

  it('calls onContextChange with null when "Personal" option is selected', async () => {
    render(
      <ChatContextSelector
        organizations={mockOrganizations}
        currentContextId={'org_1'} // Start with an org selected
        onContextChange={onContextChangeMock}
        isLoading={false}
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    const personalOption = await within(listbox).findByText('Personal');
    fireEvent.click(personalOption);
    expect(onContextChangeMock).toHaveBeenCalledWith(null);
  });

  it('calls onContextChange with orgId when an organization option is selected', async () => {
    render(
      <ChatContextSelector
        organizations={mockOrganizations}
        currentContextId={null} // Start with "Personal"
        onContextChange={onContextChangeMock}
        isLoading={false}
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    const orgOneOption = await within(listbox).findByText('Org One');
    fireEvent.click(orgOneOption);
    expect(onContextChangeMock).toHaveBeenCalledWith('org_1');
  });

  it('disables the select when isLoading is true', () => {
    render(
      <ChatContextSelector
        organizations={mockOrganizations}
        currentContextId={null}
        onContextChange={onContextChangeMock}
        isLoading={true}
      />
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('handles empty state (still shows "Personal" option in dropdown)', async () => {
    render(
      <ChatContextSelector
        organizations={[]}
        currentContextId={null}
        onContextChange={onContextChangeMock}
        isLoading={false}
      />
    );
    fireEvent.click(screen.getByRole('combobox'));
    const listbox = await screen.findByRole('listbox');
    expect(await within(listbox).findByText('Personal')).toBeInTheDocument();
    expect(within(listbox).queryByText('Org One')).not.toBeInTheDocument();
  });

  it('shows a loading placeholder in the trigger when isLoading is true', () => {
    render(
      <ChatContextSelector
        organizations={[]}
        currentContextId={null}
        onContextChange={onContextChangeMock}
        isLoading={true}
      />
    );
    expect(screen.getByRole('combobox')).toHaveTextContent(/loading contexts.../i);
  });
}); 