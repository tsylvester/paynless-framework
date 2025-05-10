import { render, screen } from '@testing-library/react';
import { MarkdownRenderer } from './MarkdownRenderer';

describe('MarkdownRenderer', () => {
  it('should render bold text correctly', () => {
    render(<MarkdownRenderer content="**bold text**" />);
    const boldElement = screen.getByText('bold text');
    expect(boldElement.tagName).toBe('STRONG');
  });

  it('should render italic text correctly', () => {
    render(<MarkdownRenderer content="*italic text*" />);
    const italicElement = screen.getByText('italic text');
    expect(italicElement.tagName).toBe('EM');
  });

  it('should render a link correctly', () => {
    render(<MarkdownRenderer content="[Paynless](https://paynless.io)" />);
    const linkElement = screen.getByRole('link', { name: 'Paynless' }) as HTMLAnchorElement;
    expect(linkElement).toBeInTheDocument();
    expect(linkElement.href).toBe('https://paynless.io/'); // Browsers might add trailing slash
  });

  it('should render an unordered list correctly', () => {
    render(<MarkdownRenderer content={`* Item 1
* Item 2`} />);
    const listItem1 = screen.getByText('Item 1');
    const listItem2 = screen.getByText('Item 2');
    expect(listItem1.tagName).toBe('LI');
    expect(listItem2.tagName).toBe('LI');
    expect(listItem1.parentElement?.tagName).toBe('UL');
  });

  it('should render an ordered list correctly', () => {
    render(<MarkdownRenderer content={`1. First item
2. Second item`} />);
    const listItem1 = screen.getByText('First item');
    const listItem2 = screen.getByText('Second item');
    expect(listItem1.tagName).toBe('LI');
    expect(listItem2.tagName).toBe('LI');
    expect(listItem1.parentElement?.tagName).toBe('OL');
  });

  it('should render inline code correctly', () => {
    render(<MarkdownRenderer content="`const x = 10;`" />);
    const codeElement = screen.getByText('const x = 10;');
    expect(codeElement.tagName).toBe('CODE');
    // Check if it's not inside a <pre> for inline
    expect(codeElement.parentElement?.tagName).not.toBe('PRE');
  });

  it('should render a GFM code block correctly', () => {
    const codeContent = 'function greet() {\n  console.log("Hello");\n}';
    render(<MarkdownRenderer content={"```javascript\n" + codeContent + "\n```"} />);
    const codeElement = document.querySelector('pre > code.language-javascript');
    expect(codeElement).toBeInTheDocument();
    expect(codeElement?.tagName).toBe('CODE');
    expect(codeElement?.parentElement?.tagName).toBe('PRE');
    expect(codeElement).toHaveClass('language-javascript');
    expect(codeElement?.textContent?.trim()).toBe(codeContent.trim());
  });

  it('should render a blockquote correctly', () => {
    render(<MarkdownRenderer content="> This is a quote." />);
    const quoteText = screen.getByText('This is a quote.');
    expect(quoteText.tagName).toBe('P');
    expect(quoteText.parentElement?.tagName).toBe('BLOCKQUOTE');
  });

  it('should render paragraphs correctly', () => {
    render(<MarkdownRenderer content={`Hello

World`} />);
    const p1 = screen.getByText('Hello');
    const p2 = screen.getByText('World');
    expect(p1.tagName).toBe('P');
    expect(p2.tagName).toBe('P');
  });

  it('should render a combination of markdown elements', () => {
    render(<MarkdownRenderer content="This is **bold** and _italic_ with a [link](https://example.com)." />);
    const boldElement = screen.getByText('bold');
    const italicElement = screen.getByText('italic');
    const linkElement = screen.getByRole('link', { name: 'link' }) as HTMLAnchorElement;
    expect(boldElement.tagName).toBe('STRONG');
    expect(italicElement.tagName).toBe('EM');
    expect(linkElement).toBeInTheDocument();
    expect(linkElement.href).toBe('https://example.com/');
  });

  it('should render H1 heading correctly', () => {
    render(<MarkdownRenderer content="# Heading 1" />);
    const headingElement = screen.getByRole('heading', { level: 1, name: 'Heading 1' });
    expect(headingElement).toBeInTheDocument();
    expect(headingElement.tagName).toBe('H1');
  });

  it('should render H2 heading correctly', () => {
    render(<MarkdownRenderer content="## Heading 2" />);
    const headingElement = screen.getByRole('heading', { level: 2, name: 'Heading 2' });
    expect(headingElement).toBeInTheDocument();
    expect(headingElement.tagName).toBe('H2');
  });

  it('should render H3 heading correctly', () => {
    render(<MarkdownRenderer content="### Heading 3" />);
    const headingElement = screen.getByRole('heading', { level: 3, name: 'Heading 3' });
    expect(headingElement).toBeInTheDocument();
    expect(headingElement.tagName).toBe('H3');
  });

  it('should render strikethrough text correctly', () => {
    render(<MarkdownRenderer content="~~deleted~~" />);
    const strikethroughElement = screen.getByText('deleted');
    expect(strikethroughElement.tagName).toBe('DEL');
  });

  it('should render a horizontal rule correctly', () => {
    render(<MarkdownRenderer content="---" />);
    const hrElement = screen.getByRole('separator');
    expect(hrElement).toBeInTheDocument();
    expect(hrElement.tagName).toBe('HR');
  });

  it('should render task list items correctly', () => {
    render(<MarkdownRenderer content={`- [x] Completed Task
- [ ] Open Task`} />);
    const completedTaskTextElement = screen.getByText('Completed Task');
    const openTaskTextElement = screen.getByText('Open Task');
    const completedListItem = completedTaskTextElement.closest('li');
    expect(completedListItem).toBeInTheDocument();
    const completedCheckbox = completedListItem?.querySelector('input[type="checkbox"]');
    expect(completedCheckbox).toBeInTheDocument();
    expect(completedCheckbox?.tagName).toBe('INPUT');
    expect(completedCheckbox).toBeChecked();
    expect(completedCheckbox).toBeDisabled();
    expect(completedListItem?.parentElement?.tagName).toBe('UL');
    const openListItem = openTaskTextElement.closest('li');
    expect(openListItem).toBeInTheDocument();
    const openCheckbox = openListItem?.querySelector('input[type="checkbox"]');
    expect(openCheckbox).toBeInTheDocument();
    expect(openCheckbox?.tagName).toBe('INPUT');
    expect(openCheckbox).not.toBeChecked();
    expect(openCheckbox).toBeDisabled();
    expect(openListItem?.parentElement?.tagName).toBe('UL');
  });

  it('should render a table correctly', () => {
    const markdownTable = 
      '| Header 1 | Header 2 |\n' +
      '| -------- | -------- |\n' +
      '| Cell 1   | Cell 2   |\n' +
      '| Cell 3   | Cell 4   |';
    render(<MarkdownRenderer content={markdownTable} />);
    const tableElement = screen.getByRole('table');
    expect(tableElement).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Header 1' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Header 2' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Cell 1' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Cell 2' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Cell 3' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Cell 4' })).toBeInTheDocument();
  });
}); 