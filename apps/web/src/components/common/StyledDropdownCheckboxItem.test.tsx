import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'; // Required for context
import { StyledDropdownCheckboxItem } from './StyledDropdownCheckboxItem';
import { CheckIcon } from 'lucide-react';

// Mock lucide-react specifically for CheckIcon to inspect its presence
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    CheckIcon: vi.fn((props) => <svg data-testid="check-icon" {...props} />),
  };
});

describe('StyledDropdownCheckboxItem', () => {
  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <DropdownMenu open={true}> {/* Keep open for testing content visibility */}
      <DropdownMenuTrigger asChild>
        <button>Open</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock scrollIntoView for headless browser environment if needed by Radix
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders with children', () => {
    render(
      <TestWrapper>
        <StyledDropdownCheckboxItem>Test Item</StyledDropdownCheckboxItem>
      </TestWrapper>
    );
    expect(screen.getByText('Test Item')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(
      <TestWrapper>
        <StyledDropdownCheckboxItem className="custom-class">Test Item</StyledDropdownCheckboxItem>
      </TestWrapper>
    );
    // Radix components often render the child with the class, need to check role
    expect(screen.getByRole('menuitemcheckbox')).toHaveClass('custom-class');
  });

  it('shows CheckIcon when checked is true', () => {
    render(
      <TestWrapper>
        <StyledDropdownCheckboxItem checked={true}>Test Item</StyledDropdownCheckboxItem>
      </TestWrapper>
    );
    expect(screen.getByTestId('check-icon')).toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByRole('menuitemcheckbox')).toBeChecked(); // aria-checked
  });

  it('does not show CheckIcon when checked is false', () => {
    render(
      <TestWrapper>
        <StyledDropdownCheckboxItem checked={false}>Test Item</StyledDropdownCheckboxItem>
      </TestWrapper>
    );
    expect(screen.queryByTestId('check-icon')).not.toBeInTheDocument();
    expect(screen.getByRole('menuitemcheckbox')).toHaveAttribute('data-state', 'unchecked');
    expect(screen.getByRole('menuitemcheckbox')).not.toBeChecked(); // aria-checked
  });
  
  it('calls onCheckedChange when clicked and not disabled', async () => {
    const mockOnCheckedChange = vi.fn();
    render(
      <TestWrapper>
        <StyledDropdownCheckboxItem checked={false} onCheckedChange={mockOnCheckedChange}>
          Click me
        </StyledDropdownCheckboxItem>
      </TestWrapper>
    );
    const item = screen.getByText('Click me');
    await userEvent.click(item);
    expect(mockOnCheckedChange).toHaveBeenCalledTimes(1);
    // Radix DropdownMenuCheckboxItem's onCheckedChange is called with the new checked state (boolean)
    expect(mockOnCheckedChange).toHaveBeenCalledWith(true); 
  });

  it('calls onSelect when clicked', async () => {
    const mockOnSelect = vi.fn();
    render(
      <TestWrapper>
        <StyledDropdownCheckboxItem onSelect={mockOnSelect}>Select me</StyledDropdownCheckboxItem>
      </TestWrapper>
    );
    const item = screen.getByText('Select me');
    await userEvent.click(item);
    // onSelect is called with the event, check it was called at least
    expect(mockOnSelect).toHaveBeenCalledTimes(1); 
    // We can also check that the default behavior (closing the menu) is prevented if onSelect calls event.preventDefault()
    // This component's onSelect prop in AIModelSelector *does* call event.preventDefault()
    // However, testing that here is more about testing Radix behavior.
    // We're primarily concerned that *our* prop is being passed through.
  });

  it('is disabled and not interactive when disabled prop is true', async () => {
    const mockOnCheckedChange = vi.fn();
    const mockOnSelect = vi.fn();
    render(
      <TestWrapper>
        <StyledDropdownCheckboxItem 
          disabled 
          onCheckedChange={mockOnCheckedChange}
          onSelect={mockOnSelect}
        >
          Disabled Item
        </StyledDropdownCheckboxItem>
      </TestWrapper>
    );
    const item = screen.getByText('Disabled Item');
    expect(item).toHaveAttribute('data-disabled'); // Radix specific disabled attribute
    // Check for aria-disabled as well for accessibility
    expect(item).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(item); // Try to click
    expect(mockOnCheckedChange).not.toHaveBeenCalled();
    expect(mockOnSelect).not.toHaveBeenCalled();
  });

}); 