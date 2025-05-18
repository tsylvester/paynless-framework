import { create } from 'zustand';
import { analytics } from '@paynless/analytics';
import type { AnalyticsClient, AnalyticsEventPayload } from '@paynless/types';

// Define the state and actions for the analytics store
// It will essentially mirror the AnalyticsClient interface
interface AnalyticsStoreState extends AnalyticsClient {}

// Create the Zustand store
export const useAnalyticsStore = create<AnalyticsStoreState>()(() => ({
  // Spread the methods from the imported analytics client instance
  identify: (userId: string, traits?: Record<string, any>) => analytics.identify(userId, traits),
  track: (eventName: string, payload?: AnalyticsEventPayload) => analytics.track(eventName, payload),
  reset: () => analytics.reset(),
}));

// Optional: Export parts of the state directly if needed, though hooks are preferred.
// export const { identify, track, reset } = useAnalyticsStore.getState(); 