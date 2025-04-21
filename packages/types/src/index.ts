// Export all types from the types package
export * from './auth.types';
export * from './subscription.types';
export * from './theme.types';
export * from './route.types';
export * from './api.types';
export * from './ai.types';
export * from './platform.types';
export * from './analytics.types';
export * from './email.types';

// Export Json type if it's defined elsewhere or define basic alias
// If Json is complex and defined in its own file (e.g., json.types.ts), export that:
// export * from './json.types'; 
// Otherwise, a simple alias might suffice if not already defined:
export type Json = 
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Ensure vite-env types are handled if needed, maybe not exported directly
// /// <reference types="vite/client" />

// Re-export the Vite environment types (they're ambient declarations)
export {};

// This file serves as a reference to vite-env.d.ts which provides ambient declarations
// for import.meta.env across all packages