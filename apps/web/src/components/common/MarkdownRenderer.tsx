import React, { CSSProperties } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export interface MarkdownRendererProps {
  content: string | object; // Allow content to be an object
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  // Basic styling for markdown elements using Tailwind prose classes
  const markdownStyles = `
    prose 
    dark:prose-invert 
    prose-sm 
    max-w-none
    min-w-0
    prose-headings:font-semibold 
    prose-a:text-blue-600 prose-a:hover:underline
    prose-code:bg-gray-200 prose-code:dark:bg-gray-800 prose-code:p-1 prose-code:rounded prose-code:text-sm
    prose-pre:bg-gray-200 prose-pre:dark:bg-gray-800 prose-pre:p-2 prose-pre:rounded prose-pre:overflow-x-auto
    prose-blockquote:border-l-4 prose-blockquote:pl-4 prose-blockquote:italic
  `;

  let processedContent: string;
  if (typeof content === 'object' && content !== null) {
    // For objects, stringify as JSON and wrap in a JSON code block.
    // Newlines within JSON strings will be preserved as \n by JSON.stringify
    // and correctly rendered as such within the code block.
    // remark-breaks does not and should not affect content within code blocks.
    processedContent = `\`\`\`json\n${JSON.stringify(content, null, 2)}\n\`\`\``;
  } else {
    // For string content, first ensure it's a string.
    let tempContent = String(content);
    // Replace literal "\\n" sequences with actual newline characters.
    // This allows remark-breaks to then convert these actual newlines to <br> tags.
    tempContent = tempContent.replace(/\\n/g, '\n'); // Corrected regex to match literal \n
    processedContent = tempContent;
  }

  return (
    <div className={`w-full overflow-x-auto ${markdownStyles} ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          code({
            className: mdClassName,
            children,
            ...props
          }: React.ComponentProps<'code'> & { inline?: boolean; children?: React.ReactNode; className?: string }) {
            const match = mdClassName && /language-(\w+)/.exec(mdClassName);
            const language = match && match[1] ? match[1] : undefined;

            // Use language detection to distinguish between inline and block code.
            // This is more reliable than the `inline` prop when `remark-breaks` is used.
            if (language) {
              // Block Code: Render with syntax highlighting.
              // Use PreTag="div" to avoid nesting errors (<pre> in <p>) which can happen with remark-breaks.
              const preStyle: CSSProperties = {
                whiteSpace: 'pre',
                overflowX: 'auto',
                maxWidth: '100%',
                scrollbarWidth: 'none', // Firefox
                msOverflowStyle: 'none', // IE/Edge
                backgroundColor: 'hsl(var(--muted))',
                border: 'none',
                borderRadius: '0.375rem',
              };
              return (
                <div className="[&>div]:scrollbar-none [&>div]:[-webkit-scrollbar]:hidden">
                  <Prism
                    style={{
                      ...oneDark,
                      'pre[class*="language-"]': {
                        ...oneDark['pre[class*="language-"]'],
                        background: 'hsl(var(--muted))',
                        border: 'none',
                      },
                      'code[class*="language-"]': {
                        ...oneDark['code[class*="language-"]'],
                        background: 'hsl(var(--muted))',
                      }
                    }}
                    language={language}
                    PreTag="div"
                    customStyle={preStyle}
                    {...(props as SyntaxHighlighterProps)}
                  >
                    {String(children).replace(/\n$/, '')}
                  </Prism>
                </div>
              );
            }

            // Inline Code: Render as a simple <code> tag.
            return (
              <code className={mdClassName} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}; 