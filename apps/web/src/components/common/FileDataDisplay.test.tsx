import { describe, it, expect } from 'vitest';
import { render, screen } from '@/tests/utils/render'; // Using shared render util
import { FileDataDisplay } from './FileDataDisplay';

describe('FileDataDisplay Component', () => {
  it('should render content correctly when only content prop is provided', () => {
    const testContent = "This is the file content.\nWith multiple lines.";
    render(<FileDataDisplay content={testContent} />);

    // Check that the content is rendered within the pre tag
    const preElement = screen.getByTestId('file-content-display');
    expect(preElement).toBeInTheDocument();
    // Assert against innerHTML to preserve whitespace
    expect(preElement.innerHTML).toBe(testContent);
    expect(preElement.tagName).toBe('PRE');

    // Check that the title heading is not rendered
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('should render title and content correctly when both props are provided', () => {
    const testTitle = "My File Data";
    const testContent = '{"key": "value"}';
    render(<FileDataDisplay title={testTitle} content={testContent} />);

    // Check that the title heading is rendered
    const headingElement = screen.getByRole('heading', { name: testTitle });
    expect(headingElement).toBeInTheDocument();
    expect(headingElement.tagName).toBe('H4');

    // Check that the content is rendered
    const preElement = screen.getByTestId('file-content-display');
    expect(preElement).toBeInTheDocument();
    expect(preElement).toHaveTextContent(testContent);
    expect(preElement.tagName).toBe('PRE');
  });

  it('should render correctly with empty content string', () => {
    const testTitle = "Empty File";
    render(<FileDataDisplay title={testTitle} content="" />);

    // Check title is rendered
    expect(screen.getByRole('heading', { name: testTitle })).toBeInTheDocument();

    // Check that the <pre> tag is present and empty
    const preElement = screen.getByTestId('file-content-display');
    expect(preElement).toBeInTheDocument();
    expect(preElement).toHaveTextContent("");
    expect(preElement.tagName).toBe('PRE');
  });

  it('should preserve whitespace and line breaks from content', () => {
    const testContent = "Line 1\n  Indented Line 2\n\nLine 4";
    render(<FileDataDisplay content={testContent} />);

    const preElement = screen.getByTestId('file-content-display');
    expect(preElement).toBeInTheDocument();
    // Assert against innerHTML
    expect(preElement.innerHTML).toBe(testContent);
  });
}); 