import React, { useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InternalDropdownButton, internalButtonVariants } from './InternalDropdownButton'; // Assuming it's in the same folder or adjust path
import { cn } from '@/lib/utils'; // For checking class names if needed

describe('InternalDropdownButton', () => {
  it('renders a button by default with children', () => {
    render(<InternalDropdownButton>Click Me</InternalDropdownButton>);
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Click Me');
  });

  it('applies custom className', () => {
    render(<InternalDropdownButton className="custom-class">Test</InternalDropdownButton>);
    expect(screen.getByRole('button')).toHaveClass('custom-class');
  });

  it('renders as child when asChild prop is true', () => {
    render(
      <InternalDropdownButton asChild>
        <a href="/">Link</a>
      </InternalDropdownButton>
    );
    const link = screen.getByRole('link', { name: /link/i });
    expect(link).toBeInTheDocument();
    expect(link).not.toBeInstanceOf(HTMLButtonElement);
    expect(link).toBeInstanceOf(HTMLAnchorElement);
    // Check if button classes are applied to the anchor
    // This is a bit more involved as we need to know what classes to expect.
    // We can check for a known class from the default variant.
    const defaultClasses = internalButtonVariants({ variant: 'default', size: 'default' });
    // Check for a subset or a specific class
    expect(link.className).toContain('inline-flex'); // A common base class from CVA
  });

  // Test a few variant and size combinations
  it('applies outline variant classes', () => {
    render(<InternalDropdownButton variant="outline">Outline</InternalDropdownButton>);
    const button = screen.getByRole('button');
    // We expect the classes from the 'outline' variant in internalButtonVariants
    // For example, it should include 'border' and 'bg-background'
    const expectedClasses = internalButtonVariants({ variant: 'outline', size: 'default' });
    // Due to cn merging, we might not get an exact match, so check for key classes
    expect(button.className).toMatch(/border/);
    expect(button.className).toMatch(/bg-background/);
  });

  it('applies sm size classes', () => {
    render(<InternalDropdownButton size="sm">Small</InternalDropdownButton>);
    const button = screen.getByRole('button');
    const expectedClasses = internalButtonVariants({ variant: 'default', size: 'sm' });
    expect(button.className).toMatch(/h-8/); // From sm size definition
    expect(button.className).toMatch(/px-3/);
  });

  it('applies destructive variant and lg size classes', () => {
    render(<InternalDropdownButton variant="destructive" size="lg">Large Destructive</InternalDropdownButton>);
    const button = screen.getByRole('button');
    const expectedClasses = internalButtonVariants({ variant: 'destructive', size: 'lg' });
    expect(button.className).toMatch(/bg-destructive/);
    expect(button.className).toMatch(/h-10/);
  });

  it('handles standard button attributes like type and disabled', () => {
    render(<InternalDropdownButton type="submit" disabled>Submit</InternalDropdownButton>);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toBeDisabled();
  });

  it('handles onClick event', async () => {
    const handleClick = vi.fn();
    render(<InternalDropdownButton onClick={handleClick}>Clickable</InternalDropdownButton>);
    const button = screen.getByRole('button', { name: /clickable/i });
    await userEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('forwards ref correctly', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<InternalDropdownButton ref={ref}>With Ref</InternalDropdownButton>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.textContent).toBe('With Ref');
  });
  
  it('forwards ref correctly with asChild', () => {
    const ref = React.createRef<HTMLAnchorElement>();
    render(
      <InternalDropdownButton asChild ref={ref}>
        <a href="/">Link Ref</a>
      </InternalDropdownButton>
    );
    expect(ref.current).toBeInstanceOf(HTMLAnchorElement);
    expect(ref.current?.textContent).toBe('Link Ref');
  });

}); 