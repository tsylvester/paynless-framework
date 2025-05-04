import mitt from 'mitt';

// Define event payload type
type FileDropPayload = string[];

// Define event map
type PlatformEvents = {
  'file-drop': FileDropPayload;
};

// Create and export the emitter instance
export const platformEventEmitter = mitt<PlatformEvents>();

// Export types if needed elsewhere
export type { PlatformEvents, FileDropPayload }; 