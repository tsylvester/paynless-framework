import { logger } from './logger';
import { isStripeTestMode as checkTestMode } from './edge-shared';

/**
 * Get the appropriate Stripe publishable key based on the current environment
 */
export const getStripePublishableKey = () => {
  const isTestMode = checkTestMode();
  const key = isTestMode
    ? import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_TEST
    : import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY_LIVE;
  
  if (!key) {
    const mode = isTestMode ? 'test' : 'live';
    logger.error(`Stripe ${mode} publishable key is not defined in environment variables`);
    throw new Error(`Stripe ${mode} publishable key is not defined`);
  }
  
  return key;
};

/**
 * Get the appropriate Stripe secret key based on the current environment
 * NOTE: This should only be used in secure server contexts, not in the browser!
 */
export const getStripeSecretKey = () => {
  const isTestMode = checkTestMode();
  const key = isTestMode
    ? import.meta.env.VITE_STRIPE_SECRET_KEY_TEST
    : import.meta.env.VITE_STRIPE_SECRET_KEY_LIVE;
  
  if (!key) {
    const mode = isTestMode ? 'test' : 'live';
    logger.error(`Stripe ${mode} secret key is not defined in environment variables`);
    throw new Error(`Stripe ${mode} secret key is not defined`);
  }
  
  return key;
};

/**
 * Check if the application is running in Stripe test mode
 * Exported from edge-shared to maintain compatibility with both environments
 */
export const isStripeTestMode = checkTestMode;