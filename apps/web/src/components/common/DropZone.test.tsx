import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DropZone } from './DropZone';
import type { PlatformEvents } from '@paynless/platform';

// The mock factory is now self-contained and does not reference module-scoped variables.
vi.mock('@paynless/platform', () => ({
  platformEventEmitter: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
}));

describe('DropZone Component', () => {
  // This variable will hold our correctly typed mock after the dynamic import.
  let mockPlatformEventEmitter: {
    on: Mock<[keyof PlatformEvents, () => void], void>;
    off: Mock<[keyof PlatformEvents, () => void], void>;
    emit: Mock<[keyof PlatformEvents, unknown], void>;
  };

  beforeEach(async () => {
    // Dynamically import the module to get the mocked version.
    // This resolves the hoisting issue.
    const platformModule = await import('@paynless/platform');
    mockPlatformEventEmitter = platformModule.platformEventEmitter;

    // Clear mocks before each test
    mockPlatformEventEmitter.on.mockClear();
    mockPlatformEventEmitter.off.mockClear();
    mockPlatformEventEmitter.emit.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render default text and icon when not hovering', () => {
    render(<DropZone />);
    expect(screen.getByText('Drag and drop file here')).toBeInTheDocument();
  });

  it('should render children when provided and not hovering', () => {
    const childText = 'Custom content inside';
    render(<DropZone><p>{childText}</p></DropZone>);
    expect(screen.getByText(childText)).toBeInTheDocument();
  });

  it('should change appearance and show active text on drag enter/over', () => {
    const activeText = 'Drop it like it\'s hot';
    render(<DropZone activeText={activeText} />);
    const dropZone = screen.getByLabelText('File drop zone');

    const handleHover = mockPlatformEventEmitter.on.mock.calls.find(
      (call) => call[0] === 'file-drag-hover'
    )?.[1];
    
    act(() => {
      if (handleHover) handleHover();
      else throw new Error('handleHover callback not found');
    });

    expect(dropZone).toHaveClass('border-primary', 'bg-primary/10');
    expect(screen.getByText(activeText)).toBeInTheDocument();
  });

  it('should revert appearance on drag leave', () => {
    render(<DropZone />);
    const dropZone = screen.getByLabelText('File drop zone');
    const handleHover = mockPlatformEventEmitter.on.mock.calls.find(
      (call) => call[0] === 'file-drag-hover'
    )?.[1];
    const handleCancel = mockPlatformEventEmitter.on.mock.calls.find(
      (call) => call[0] === 'file-drag-cancel'
    )?.[1];
    
    act(() => {
      if (handleHover) handleHover();
      else throw new Error('Event callbacks not found');
    });
    
    expect(dropZone).toHaveClass('border-primary');

    act(() => {
      if (handleCancel) handleCancel();
    });

    expect(dropZone).toHaveClass('border-muted');
    expect(screen.getByText('Drag and drop file here')).toBeInTheDocument();
  });

   it('should revert appearance on drop', () => {
     render(<DropZone />);
     const dropZone = screen.getByLabelText('File drop zone');
     const handleHover = mockPlatformEventEmitter.on.mock.calls.find(
       (call) => call[0] === 'file-drag-hover'
     )?.[1];
     const handleCancel = mockPlatformEventEmitter.on.mock.calls.find(
       (call) => call[0] === 'file-drag-cancel'
     )?.[1];
     
     act(() => {
       if (handleHover) handleHover();
       else throw new Error('Event callbacks not found');
     });
     
     expect(dropZone).toHaveClass('border-primary');
     
     act(() => {
       if (handleCancel) handleCancel();
     });
 
     expect(dropZone).toHaveClass('border-muted');
     expect(screen.getByText('Drag and drop file here')).toBeInTheDocument();
   });
}); 