import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

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
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children, ...props }: React.ComponentProps<'code'> & { inline?: boolean; children?: React.ReactNode }) {
            const match = /language-(\w+)/.exec(className || '');
            if (inline || !className) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <div style={{ margin: 0, padding: '0.5em 1em', borderRadius: '0.5em', fontSize: '0.95em' }}>
                <Prism
                  style={oneDark}
                  language={match ? match[1] : undefined}
                >
                  {String(children).replace(/\n$/, '')}
                </Prism>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}; 