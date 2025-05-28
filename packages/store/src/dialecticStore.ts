import { create } from 'zustand';
import type { ApiError } from '@paynless/types';
import { api } from '@paynless/api';
import { logger } from '@paynless/utils';

export interface DialecticStateValues {
  availableDomainTags: string[];
  isLoadingDomainTags: boolean;
  domainTagsError: ApiError | null;
  selectedDomainTag: string | null;
}

export interface DialecticActions {
  fetchAvailableDomainTags: () => Promise<void>;
  setSelectedDomainTag: (tag: string | null) => void;
  _resetForTesting?: () => void;
}

export type DialecticStore = DialecticStateValues & DialecticActions;

export const initialDialecticStateValues: DialecticStateValues = {
  availableDomainTags: [],
  isLoadingDomainTags: false,
  domainTagsError: null,
  selectedDomainTag: null,
};

export const useDialecticStore = create<DialecticStore>((set, get) => ({
  ...initialDialecticStateValues,

  fetchAvailableDomainTags: async () => {
    set({ isLoadingDomainTags: true, domainTagsError: null });
    logger.info('[DialecticStore] Fetching available domain tags...');
    try {
      const response = await api.dialectic().listAvailableDomainTags();
      
      if (response.error) {
        logger.error('[DialecticStore] Error fetching domain tags:', response.error);
        set({ availableDomainTags: [], isLoadingDomainTags: false, domainTagsError: response.error });
      } else {
        logger.info('[DialecticStore] Successfully fetched domain tags:', response.data);
        set({
          availableDomainTags: response.data || [],
          isLoadingDomainTags: false,
          domainTagsError: null,
        });
      }
    } catch (error: unknown) {
      const networkError: ApiError = {
        message: error instanceof Error ? error.message : 'An unknown network error occurred while fetching domain tags',
        code: 'NETWORK_ERROR',
      };
      logger.error('[DialecticStore] Network error fetching domain tags:', networkError);
      set({ availableDomainTags: [], isLoadingDomainTags: false, domainTagsError: networkError });
    }
  },

  setSelectedDomainTag: (tag: string | null) => {
    logger.info(`[DialecticStore] Setting selected domain tag to: ${tag}`);
    set({ selectedDomainTag: tag });
  },

  _resetForTesting: () => {
    set(initialDialecticStateValues);
    logger.info('[DialecticStore] Reset for testing.');
  }
}));

export const getDialecticStoreInitialState = (): DialecticStateValues => ({ ...initialDialecticStateValues }); 