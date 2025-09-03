import React from 'react';
import { Button } from '@/components/ui/button';
import { useDialecticStore } from '@paynless/store';
import { logger } from '@paynless/utils';
import { toast } from 'sonner';

type ButtonVariant = Parameters<typeof Button>[0] extends { variant?: infer V } ? V : never;
type ButtonSize = Parameters<typeof Button>[0] extends { size?: infer S } ? S : never;

interface ExportProjectButtonProps {
  projectId: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children?: React.ReactNode;
}

export const ExportProjectButton: React.FC<ExportProjectButtonProps> = ({
  projectId,
  variant = 'default',
  size = 'default',
  className,
  children,
}) => {
  const isExportingProject = useDialecticStore((s) => s.isExportingProject);
  const exportDialecticProject = useDialecticStore((s) => s.exportDialecticProject);
  const exportProjectError = useDialecticStore((s) => s.exportProjectError);

  React.useEffect(() => {
    if (!isExportingProject && exportProjectError) {
      toast.error(exportProjectError.message);
    }
  }, [isExportingProject, exportProjectError]);

  const handleClick = async () => {
    try {
      const response = await exportDialecticProject(projectId);
      if (response && 'error' in response && response.error) {
        logger.error('[ExportProjectButton] Export failed', { projectId, error: response.error });
        toast.error(response.error.message);
        return;
      }

      const url = response && 'data' in response ? response.data?.export_url : undefined;
      const fileName = response && 'data' in response ? response.data?.file_name : undefined;

      if (!url) {
        logger.warn('[ExportProjectButton] Export completed without a URL', { projectId });
        toast.error('Export completed but no download URL was provided.');
        return;
      }

      if (!fileName) {
        logger.error('[ExportProjectButton] Missing file_name from backend; aborting download', { projectId });
        toast.error('Export failed: missing file name.');
        return;
      }

      const res = await fetch(url, { method: 'GET' });
      if (!res.ok) {
        throw new Error(`Failed to download export (status ${res.status})`);
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.setAttribute('download', fileName);
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
      toast.success('Export started');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error during export';
      logger.error('[ExportProjectButton] Unexpected error', { projectId, message, err });
      toast.error(message);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={isExportingProject}
      aria-busy={isExportingProject ? 'true' : 'false'}
      className={className}
    >
      {children || 'Export'}
    </Button>
  );
};


