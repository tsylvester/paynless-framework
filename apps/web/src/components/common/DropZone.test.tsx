import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@/tests/utils/render';
import { DropZone } from './DropZone';
import { UploadCloud } from 'lucide-react';
import { platformEventEmitter } from '@paynless/platform';

// Mock the emitter
vi.mock('@paynless/platform', async (importOriginal) => {
  const original = await importOriginal<typeof import('@paynless/platform')>();
  return {
    ...original, // Keep original exports
    platformEventEmitter: {
      // Mock specific methods needed by tests
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(), 
    },
  };
});

describe('DropZone Component', () => {
  it('should render default text and icon when not hovering', () => {
    render(<DropZone />);
    expect(screen.getByText('Drag and drop file here')).toBeInTheDocument();
    expect(screen.getByText('(or use the import button)')).toBeInTheDocument();
    // Check for UploadCloud icon (might need a more specific selector if needed)
    expect(screen.getByLabelText('File drop zone').querySelector('svg')).toBeInTheDocument(); 
  });

  it('should render children when provided and not hovering', () => {
    const childText = 'Custom content inside';
    render(<DropZone><p>{childText}</p></DropZone>);
    expect(screen.getByText(childText)).toBeInTheDocument();
    expect(screen.queryByText('Drag and drop file here')).not.toBeInTheDocument();
  });

  it('should change appearance and show active text on drag enter/over', async () => {
    const activeText = 'Drop it like it\'s hot';
    render(<DropZone activeText={activeText} />);
    const dropZone = screen.getByLabelText('File drop zone');

    // Check initial state
    expect(dropZone).toHaveClass('border-muted');
    expect(dropZone).not.toHaveClass('border-primary');
    expect(screen.getByText('Drag and drop file here')).toBeInTheDocument();
    expect(screen.queryByText(activeText)).not.toBeInTheDocument();

    // Simulate drag hover event from emitter
    // Manually trigger the callback that the useEffect would register
    const handleHover = platformEventEmitter.on.mock.calls.find(call => call[0] === 'file-drag-hover')?.[1];
    if (handleHover) handleHover(); 
    else throw new Error('handleHover callback not found');

    // Check hovering state
    await waitFor(() => { // Wait for state update
      expect(dropZone).toHaveClass('border-primary', 'bg-primary/10');
      expect(dropZone).not.toHaveClass('border-muted');
      expect(screen.queryByText('Drag and drop file here')).not.toBeInTheDocument();
      expect(screen.getByText(activeText)).toBeInTheDocument();
    });
  });

  it('should revert appearance on drag leave', async () => {
    render(<DropZone />);
    const dropZone = screen.getByLabelText('File drop zone');
    const handleHover = platformEventEmitter.on.mock.calls.find(call => call[0] === 'file-drag-hover')?.[1];
    const handleCancel = platformEventEmitter.on.mock.calls.find(call => call[0] === 'file-drag-cancel')?.[1];
    if (!handleHover || !handleCancel) throw new Error('Event callbacks not found');

    // Enter then leave via emitter events
    handleHover();
    await waitFor(() => expect(dropZone).toHaveClass('border-primary')); // Wait for hover state
    handleCancel();

    // Check reverted state
    await waitFor(() => { // Wait for state update
      expect(dropZone).toHaveClass('border-muted');
      expect(dropZone).not.toHaveClass('border-primary');
      expect(screen.getByText('Drag and drop file here')).toBeInTheDocument();
    });
  });

   it('should revert appearance on drop', async () => {
     render(<DropZone />);
     const dropZone = screen.getByLabelText('File drop zone');
     const handleHover = platformEventEmitter.on.mock.calls.find(call => call[0] === 'file-drag-hover')?.[1];
     const handleCancel = platformEventEmitter.on.mock.calls.find(call => call[0] === 'file-drag-cancel')?.[1];
     if (!handleHover || !handleCancel) throw new Error('Event callbacks not found');
 
     // Enter then simulate drop (which triggers cancel)
     handleHover();
     await waitFor(() => expect(dropZone).toHaveClass('border-primary')); // Wait for hover state
     // Simulate drop by triggering the cancel event
     handleCancel(); 
 
     // Check reverted state
     await waitFor(() => { // Wait for state update
       expect(dropZone).toHaveClass('border-muted');
       expect(dropZone).not.toHaveClass('border-primary');
       expect(screen.getByText('Drag and drop file here')).toBeInTheDocument();
     });
   });

}); 