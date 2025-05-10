import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  // Basic styling for markdown elements using Tailwind prose classes
  const markdownStyles = `
    prose 
    dark:prose-invert 
    prose-sm 
    max-w-none 
    prose-headings:font-semibold 
    prose-a:text-blue-600 prose-a:hover:underline
    prose-code:bg-gray-200 prose-code:dark:bg-gray-800 prose-code:p-1 prose-code:rounded prose-code:text-sm
    prose-pre:bg-gray-200 prose-pre:dark:bg-gray-800 prose-pre:p-2 prose-pre:rounded prose-pre:overflow-x-auto
    prose-blockquote:border-l-4 prose-blockquote:pl-4 prose-blockquote:italic
  `;

  return (
    <div className={`${markdownStyles} ${className || ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}; 