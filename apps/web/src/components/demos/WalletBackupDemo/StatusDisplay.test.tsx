import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { StatusDisplay, StatusDisplayProps } from './StatusDisplay'; // Component to be created
import { Info, CheckCircle, AlertCircle } from 'lucide-react';

// Mock lucide-react icons
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual('lucide-react');
  return {
    ...actual,
    Info: (props: any) => <svg data-testid="info-icon" {...props} />,
    CheckCircle: (props: any) => <svg data-testid="success-icon" {...props} />,
    AlertCircle: (props: any) => <svg data-testid="error-icon" {...props} />,
  };
});

describe('StatusDisplay Component', () => {

  // Test Case 1: Renders nothing when message is null or empty
  it('should render nothing when message is null', () => {
    const { container } = render(<StatusDisplay message={null} variant="info" />);
    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when message is an empty string', () => {
    const { container } = render(<StatusDisplay message="" variant="info" />);
    expect(container.firstChild).toBeNull();
  });

  // Test Case 2: Renders Alert with correct message
  it('should render Alert with the correct message', () => {
    const testMessage = 'This is a test message';
    render(<StatusDisplay message={testMessage} variant="info" />);
    expect(screen.getByText(testMessage)).toBeInTheDocument();
    // Check that it renders within an alert role
    expect(screen.getByRole('alert')).toContainElement(screen.getByText(testMessage));
  });

  // Test Case 3 & 4 & 5: Renders correct icon, title, and variant based on props
  it.each`
    variant      | expectedIconTestId | expectedTitle   | expectedAlertVariant
    ${'info'}    | ${'info-icon'}     | ${'Information'} | ${'default'}          // Shadcn default variant for info
    ${'success'} | ${'success-icon'}  | ${'Success'}    | ${'default'}          // Shadcn default variant for success
    ${'error'}   | ${'error-icon'}    | ${'Error'}      | ${'destructive'}    // Shadcn destructive variant for error
  `(
    'should render $expectedTitle title, $expectedIconTestId icon, and $expectedAlertVariant alert variant for variant "$variant"',
    ({ variant, expectedIconTestId, expectedTitle, expectedAlertVariant }) => {
      render(<StatusDisplay message="Test" variant={variant as StatusDisplayProps['variant']} />);

      const alertElement = screen.getByRole('alert');

      // Check icon
      expect(screen.getByTestId(expectedIconTestId)).toBeInTheDocument();

      // Check title
      // expect(screen.getByRole('heading', { name: expectedTitle })).toBeInTheDocument(); // Fails as AlertTitle is a div
      expect(within(alertElement).getByText(expectedTitle)).toBeInTheDocument();

      // Check Alert variant (using class check as variant prop isn't directly on DOM)
      if (expectedAlertVariant === 'destructive') {
        expect(alertElement).toHaveClass('text-destructive');
      } else {
        expect(alertElement).not.toHaveClass('text-destructive');
      }
    }
  );

}); 