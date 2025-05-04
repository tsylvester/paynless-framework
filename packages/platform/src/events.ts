import mitt from 'mitt';

// Define event payload type
type FileDropPayload = string[];

// Define event map
type PlatformEvents = {
  'file-drop': FileDropPayload;
  'file-drag-hover': void; // File is being dragged over the window
  'file-drag-cancel': void; // Drag operation cancelled (left window)
};

// Create and export the emitter instance
export const platformEventEmitter = mitt<PlatformEvents>();

// Export types if needed elsewhere
export type { PlatformEvents, FileDropPayload }; 