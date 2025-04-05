/**
 * Type definitions for Vite environment variables
 * This provides a single source of truth for all import.meta.env types across packages
 */

// Extend Vite's ImportMeta interface for PUBLIC, VITE_ prefixed variables
declare interface ImportMeta {
  readonly env: {
    // API and server URLs
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    
    // Stripe-related PUBLIC environment variables
    readonly VITE_STRIPE_TEST_MODE: string;
    readonly VITE_STRIPE_PUBLISHABLE_KEY_TEST: string;
    readonly VITE_STRIPE_PUBLISHABLE_KEY_LIVE: string;
    // REMOVED Secret keys - should not be VITE_ prefixed or in ImportMeta
    
    // Allow any other VITE_ prefixed environment variables
    readonly [key: `VITE_${string}`]: string;
  };
}

// Extend Node.js ProcessEnv interface for SERVER-SIDE environment variables
declare namespace NodeJS {
  interface ProcessEnv {
    // Server-side specific variables
    STRIPE_TEST_MODE?: string;
    STRIPE_SECRET_KEY_TEST?: string; // Define server-side secrets here
    STRIPE_SECRET_KEY_LIVE?: string; // Define server-side secrets here
    NODE_ENV?: string;
    // Allow any other environment variables on server
    [key: string]: string | undefined;
  }
} 