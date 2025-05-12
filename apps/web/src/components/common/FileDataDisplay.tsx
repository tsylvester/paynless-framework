import React from 'react';

interface FileDataDisplayProps {
  content: string;
  title?: string;
}

/**
 * A component to display string content, typically loaded from a file,
 * within a formatted, read-only container.
 */
export const FileDataDisplay: React.FC<FileDataDisplayProps> = ({ content, title }) => {
  return (
    <div className="mt-4 p-3 border rounded-md bg-muted/50">
      {title && (
        <h4 className="mb-2 text-sm font-medium text-muted-foreground">
          {title}
        </h4>
      )}
      <pre className="text-sm whitespace-pre-wrap break-words overflow-x-auto" data-testid="file-content-display">
        {content}
      </pre>
    </div>
  );
}; 