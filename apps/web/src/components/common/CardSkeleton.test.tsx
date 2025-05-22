import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CardSkeleton } from './CardSkeleton';

// Mock the primitive Skeleton component to make assertions easier
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className: string }) => (
    <div data-testid="primitive-skeleton" className={className}></div>
  ),
}));

describe('CardSkeleton Component', () => {
  it('should render header skeletons when includeHeader is true (default)', () => {
    const { container } = render(<CardSkeleton includeHeader={true} />);
    const header = container.querySelector('[data-slot="card-header"]');
    expect(header).toBeInTheDocument();
    const headerSkeletons = within(header as HTMLElement).getAllByTestId('primitive-skeleton');
    expect(headerSkeletons.length).toBe(2); // Based on CardSkeleton implementation (title line, description line)
  });

  it('should not render header skeletons when includeHeader is false', () => {
    const { container } = render(<CardSkeleton includeHeader={false} />);
    expect(container.querySelector('[data-slot="card-header"]')).not.toBeInTheDocument();
  });

  it('should render the default number of field skeletons (2)', () => {
    const { container } = render(<CardSkeleton numberOfFields={2} />); // Explicitly using the adjusted default
    const content = container.querySelector('[data-slot="card-content"]');
    expect(content).toBeInTheDocument();
    const fieldSkeletons = within(content as HTMLElement).getAllByTestId('primitive-skeleton');
    // Each field in CardSkeleton has 2 primitive skeletons (label-like, input-like)
    expect(fieldSkeletons.length).toBe(2 * 2);
  });

  it('should render a specified number of field skeletons', () => {
    const numFields = 3;
    const { container } = render(<CardSkeleton numberOfFields={numFields} />);
    const content = container.querySelector('[data-slot="card-content"]');
    expect(content).toBeInTheDocument();
    const fieldSkeletons = within(content as HTMLElement).getAllByTestId('primitive-skeleton');
    expect(fieldSkeletons.length).toBe(numFields * 2);
  });

  it('should not render footer skeletons when includeFooter is false (default)', () => {
    const { container } = render(<CardSkeleton includeFooter={false} />);
    expect(container.querySelector('[data-slot="card-footer"]')).not.toBeInTheDocument();
    // Check count of primitive skeletons if header is present and no footer
    const allSkeletons = screen.getAllByTestId('primitive-skeleton');
    expect(allSkeletons.length).toBe(2 + 2 * 2); // header (2) + default 2 fields * 2 primitives (4) = 6
  });

  it('should render footer skeletons when includeFooter is true', () => {
    const { container } = render(<CardSkeleton includeFooter={true} />);
    const footer = container.querySelector('[data-slot="card-footer"]');
    expect(footer).toBeInTheDocument();
    const footerSkeletons = within(footer as HTMLElement).getAllByTestId('primitive-skeleton');
    expect(footerSkeletons.length).toBe(1); // Based on CardSkeleton implementation
  });

  it('should apply custom heights to header skeletons', () => {
    const { container } = render(<CardSkeleton headerHeight="h-10" fieldHeight="h-5" />); // fieldHeight in header also tested
    const header = container.querySelector('[data-slot="card-header"]');
    expect(header).toBeInTheDocument();
    const headerSkeletons = within(header as HTMLElement).getAllByTestId('primitive-skeleton');
    expect(headerSkeletons[0]).toHaveClass('w-3/4 h-10 mb-2');
    expect(headerSkeletons[1]).toHaveClass('w-1/2 h-5');
  });

  it('should apply custom heights to field skeletons in content', () => {
    const { container } = render(<CardSkeleton numberOfFields={1} fieldHeight="h-6" />);
    const content = container.querySelector('[data-slot="card-content"]');
    expect(content).toBeInTheDocument();
    const fieldSkeletons = within(content as HTMLElement).getAllByTestId('primitive-skeleton');
    expect(fieldSkeletons[0]).toHaveClass('w-1/3 h-6');
    expect(fieldSkeletons[1]).toHaveClass('w-full h-6');
  });

  it('should apply custom height to footer skeleton', () => {
    const { container } = render(<CardSkeleton includeFooter={true} footerHeight="h-12" />);
    const footer = container.querySelector('[data-slot="card-footer"]');
    expect(footer).toBeInTheDocument();
    const footerSkeleton = within(footer as HTMLElement).getByTestId('primitive-skeleton');
    expect(footerSkeleton).toHaveClass('w-1/4 h-12');
  });
}); 