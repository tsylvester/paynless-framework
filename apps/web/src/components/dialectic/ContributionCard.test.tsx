import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContributionCard, ContributionCardProps } from './ContributionCard';

// Import controls from the mock store file
import {
  mockFetchContributionContent,
  mockLocalContributionCache, // Note: This is imported to be modified directly by tests
  resetDialecticStoreMocks
} from '@/mocks/dialecticStore.mock';

// Tell Vitest to use our mock implementation for @paynless/store
vi.mock('@paynless/store', async () => {
  const actualMock = await vi.importActual('@/mocks/dialecticStore.mock');
  return actualMock;
});

// Mock the MarkdownRenderer (remains an inline mock as it's specific to this component's tests)
vi.mock('@/components/common/MarkdownRenderer', () => ({
  MarkdownRenderer: vi.fn(({ content }) => <div data-testid="markdown-renderer">{content}</div>),
}));

const defaultProps: ContributionCardProps = {
  contributionId: 'test-contrib-id-1',
  title: 'Test Contribution Title',
  className: 'test-class',
};

describe('ContributionCard', () => {
  beforeEach(() => {
    resetDialecticStoreMocks(); // Use the reset function from the mock file
  });

  it('renders with a title and fetches content on mount', () => {
    render(<ContributionCard {...defaultProps} />);
    expect(screen.getByText(defaultProps.title!)).toBeInTheDocument();
    expect(mockFetchContributionContent).toHaveBeenCalledWith(defaultProps.contributionId);
  });

  it('displays skeleton loaders when content is loading', () => {
    // Directly modify the imported mockLocalContributionCache
    mockLocalContributionCache[defaultProps.contributionId] = { isLoading: true };
    const { container } = render(<ContributionCard {...defaultProps} />);
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('displays an error message when content fetching fails', () => {
    const errorMessage = 'Failed to load';
    mockLocalContributionCache[defaultProps.contributionId] = { isLoading: false, error: errorMessage };
    render(<ContributionCard {...defaultProps} />);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText(`Could not load contribution content: ${errorMessage}`)).toBeInTheDocument();
  });

  it('renders Markdown content using MarkdownRenderer', () => {
    const markdownContent = '# Hello Markdown';
    mockLocalContributionCache[defaultProps.contributionId] = {
      isLoading: false,
      content: markdownContent,
      mimeType: 'text/markdown',
    };
    render(<ContributionCard {...defaultProps} />);
    const markdownRenderer = screen.getByTestId('markdown-renderer');
    expect(markdownRenderer).toBeInTheDocument();
    expect(markdownRenderer).toHaveTextContent(markdownContent);
  });

  it('renders plain text content in a pre tag', () => {
    const plainTextContent = 'This is plain text.';
    mockLocalContributionCache[defaultProps.contributionId] = {
      isLoading: false,
      content: plainTextContent,
      mimeType: 'text/plain',
    };
    render(<ContributionCard {...defaultProps} />);
    const preElement = screen.getByText(plainTextContent);
    expect(preElement.tagName).toBe('PRE');
  });

  it('refetches content when contributionId prop changes', () => {
    const { rerender } = render(<ContributionCard {...defaultProps} />);
    expect(mockFetchContributionContent).toHaveBeenCalledTimes(1);
    expect(mockFetchContributionContent).toHaveBeenCalledWith(defaultProps.contributionId);

    const newProps = { ...defaultProps, contributionId: 'new-contrib-id-2' };
    rerender(<ContributionCard {...newProps} />);
    expect(mockFetchContributionContent).toHaveBeenCalledTimes(2);
    expect(mockFetchContributionContent).toHaveBeenCalledWith(newProps.contributionId);
  });

   it('uses default title if none provided', () => {
    const propsWithoutTitle = { ...defaultProps };
    delete propsWithoutTitle.title;
    render(<ContributionCard {...propsWithoutTitle} />);
    expect(screen.getByText('Contribution')).toBeInTheDocument(); 
  });

  it('renders skeleton initially if no cache entry exists yet', () => {
    const { container } = render(<ContributionCard {...defaultProps} />); 
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
    expect(mockFetchContributionContent).toHaveBeenCalledWith(defaultProps.contributionId);
  });
}); 