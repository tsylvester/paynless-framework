import React, { CSSProperties } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Prism } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

export interface MarkdownRendererProps {
  content: string | object; // Allow content to be an object
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  // Basic styling for markdown elements using Tailwind prose classes
  // const markdownStyles = `
  //   prose 
  //   dark:prose-invert 
  //   prose-sm 
  //   max-w-none 
  //   prose-headings:font-semibold 
  //   prose-a:text-blue-600 prose-a:hover:underline
  //   prose-code:bg-gray-200 prose-code:dark:bg-gray-800 prose-code:p-1 prose-code:rounded prose-code:text-sm
  //   prose-pre:bg-gray-200 prose-pre:dark:bg-gray-800 prose-pre:p-2 prose-pre:rounded prose-pre:overflow-x-auto
  //   prose-blockquote:border-l-4 prose-blockquote:pl-4 prose-blockquote:italic
  // `;

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
    <div className={`w-full ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          code({ inline, className: mdClassName, children, ...props }: React.ComponentProps<'code'> & { inline?: boolean; children?: React.ReactNode; className?: string }) {
            const match = mdClassName && /language-(\w+)/.exec(mdClassName);
            const language = match && match[1] ? match[1] : undefined;

            if (inline) {
              // For inline code, react-markdown does not typically add a language class.
              // We render a simple <code> tag.
              return (
                <code className={mdClassName} {...props}>
                  {children}
                </code>
              );
            }
            
            // For block code: Directly return Prism. It will render the <pre> and <code> structure.
            // react-markdown should not wrap this further if it sees Prism already rendered a <pre>.
            let contentForPrism = String(children).replace(/\n$/, '');
            if (language === 'json' && contentForPrism) {
              contentForPrism = contentForPrism.replace(/\\\\n/g, '\n'); // Handle escaped newlines in JSON strings
            }

            const preStyle: CSSProperties = { // Explicit type
              whiteSpace: 'pre-wrap', 
              wordBreak: 'break-word',
              overflowX: 'hidden',
              fontSize: '1rem',
              margin: '0 0 1.5em 0', // Example margin, adjust as needed, or let prose handle it
              padding: '1em', // Example padding, adjust as needed, or let prose handle it
              // backgroundColor will come from oneDark or can be overridden here
            };

            const codeStyle: CSSProperties = { // Explicit type
              fontFamily: 'inherit', // Inherit font family from <pre>
              fontSize: 'inherit',   // Inherit font size from <pre>
              // The whiteSpace and wordBreak are primarily for the <pre>,
              // but ensuring <code> doesn't override can be good.
              whiteSpace: 'inherit', 
              wordBreak: 'inherit',
              display: 'block', // Helps if there are very long unbreakable tokens within the code lines
              overflowX: 'auto', // If a single token is too long and display:block isn't enough, this provides internal scroll for code
            };

            return (
              <Prism
                style={oneDark} // Theme for syntax highlighting
                language={language}
                customStyle={preStyle} // Use typed const
                codeTagProps={{ style: codeStyle }} // Use typed const
                {...props} // Pass down other props from react-markdown if any (like id)
              >
                {contentForPrism}
              </Prism>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}; 