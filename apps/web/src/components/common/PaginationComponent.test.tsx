import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PaginationComponent } from './PaginationComponent'; // Adjust path as needed

// Mock callback functions
const mockOnPageChange = vi.fn();
const mockOnPageSizeChange = vi.fn();

// Default props for testing
const defaultProps = {
  currentPage: 1,
  pageSize: 10,
  totalItems: 100, // Example: 10 pages total
  onPageChange: mockOnPageChange,
  onPageSizeChange: mockOnPageSizeChange,
  allowedPageSizes: [10, 25, 50],
};

describe('PaginationComponent', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    user = userEvent.setup();
  });

  it('renders correctly with multiple pages', () => {
    render(<PaginationComponent {...defaultProps} />);

    expect(screen.getByText(/Page 1 of 10/i)).toBeInTheDocument();
    expect(screen.getByText(/100 items total/i)).toBeInTheDocument();

    // Check for navigation buttons using expected aria-labels
    expect(screen.getByRole('button', { name: /go to first page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to previous page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to next page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to last page/i })).toBeInTheDocument();

    // Check for the page size dropdown trigger
    expect(screen.getByRole('combobox')).toBeInTheDocument(); // shadcn Select trigger has combobox role
  });

  it('does not render when totalPages is 1 or less', () => {
    const propsSinglePage = { ...defaultProps, totalItems: 5 }; // totalPages = 1
    const { container } = render(<PaginationComponent {...propsSinglePage} />);
    expect(container.firstChild).toBeNull();

    const propsZeroItems = { ...defaultProps, totalItems: 0 }; // totalPages = 0
    const { container: containerZero } = render(<PaginationComponent {...propsZeroItems} />);
    expect(containerZero.firstChild).toBeNull();
  });

  it('disables previous/first buttons on page 1', () => {
    render(<PaginationComponent {...defaultProps} currentPage={1} />);
    expect(screen.getByRole('button', { name: /go to first page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /go to previous page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /go to next page/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /go to last page/i })).not.toBeDisabled();
  });

  it('disables next/last buttons on the last page', () => {
    render(<PaginationComponent {...defaultProps} currentPage={10} />); // 10 pages total
    expect(screen.getByRole('button', { name: /go to first page/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /go to previous page/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /go to next page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /go to last page/i })).toBeDisabled();
  });

  it('calls onPageChange with correct page number for next button', async () => {
    render(<PaginationComponent {...defaultProps} currentPage={5} />);
    await user.click(screen.getByRole('button', { name: /go to next page/i }));
    expect(mockOnPageChange).toHaveBeenCalledWith(6);
  });

  it('calls onPageChange with correct page number for previous button', async () => {
    render(<PaginationComponent {...defaultProps} currentPage={5} />);
    await user.click(screen.getByRole('button', { name: /go to previous page/i }));
    expect(mockOnPageChange).toHaveBeenCalledWith(4);
  });

  it('calls onPageChange with correct page number for first button', async () => {
    render(<PaginationComponent {...defaultProps} currentPage={5} />);
    await user.click(screen.getByRole('button', { name: /go to first page/i }));
    expect(mockOnPageChange).toHaveBeenCalledWith(1);
  });

  it('calls onPageChange with correct page number for last button', async () => {
    render(<PaginationComponent {...defaultProps} currentPage={5} />); 
    await user.click(screen.getByRole('button', { name: /go to last page/i }));
    expect(mockOnPageChange).toHaveBeenCalledWith(10); // 10 pages total
  });

  it('calls onPageSizeChange when a new size is selected', async () => {
    render(<PaginationComponent {...defaultProps} />);
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);
    
    // Find the element containing the text '25' within the dropdown
    const optionElement = await screen.findByText('25'); 
    await user.click(optionElement);
    
    expect(mockOnPageSizeChange).toHaveBeenCalledTimes(1);
    expect(mockOnPageSizeChange).toHaveBeenCalledWith(25);
  });

  it('renders the correct page size options', async () => {
    render(<PaginationComponent {...defaultProps} allowedPageSizes={[5, 15, 30]} />);
    const trigger = screen.getByRole('combobox');
    await user.click(trigger);

    // Verify the specified options are present using findByText
    expect(await screen.findByText('5')).toBeInTheDocument();
    expect(await screen.findByText('15')).toBeInTheDocument();
    expect(await screen.findByText('30')).toBeInTheDocument();

    // Verify a default option (not in the allowed list) is absent using queryByText
    expect(screen.queryByText('10')).not.toBeInTheDocument();
  });

}); 