/**
 * Local type definitions for Vite environment variables.
 * Copied from @paynless/types/src/vite-env.d.ts to resolve build issues.
 * Ensure this stays in sync with the canonical definition.
 */
declare interface ImportMeta {
  readonly env: {
    // API and server URLs
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    
    // Stripe-related environment variables
    readonly VITE_STRIPE_TEST_MODE: string;
    readonly VITE_STRIPE_PUBLISHABLE_KEY_TEST: string;
    readonly VITE_STRIPE_PUBLISHABLE_KEY_LIVE: string;
    readonly VITE_STRIPE_SECRET_KEY_TEST: string; // Type needed even if value used server-side
    readonly VITE_STRIPE_SECRET_KEY_LIVE: string; // Type needed even if value used server-side
    
    // Allow any other environment variables
    readonly [key: string]: string;
  };
}

// Export {} to treat this file as a module script, ensuring global augmentation.
export {}; 