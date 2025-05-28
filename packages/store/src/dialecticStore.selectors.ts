import type { DialecticStateValues } from './dialecticStore'; // Assuming DialecticStateValues is exported
import type { ApiError } from '@paynless/types';

// Selector for the list of available domain tags
export const selectAvailableDomainTags = (state: DialecticStateValues): string[] => state.availableDomainTags;

// Selector for the loading state of domain tags
export const selectIsLoadingDomainTags = (state: DialecticStateValues): boolean => state.isLoadingDomainTags;

// Selector for any error related to fetching domain tags
export const selectDomainTagsError = (state: DialecticStateValues): ApiError | null => state.domainTagsError;

// Selector for the currently selected domain tag
export const selectSelectedDomainTag = (state: DialecticStateValues): string | null => state.selectedDomainTag;

// Example of how you might use these with the store hook directly in a component:
// import { useDialecticStore } from './dialecticStore';
// const availableTags = useDialecticStore(selectAvailableDomainTags);
// const isLoading = useDialecticStore(selectIsLoadingDomainTags);
// const error = useDialecticStore(selectDomainTagsError);
// const selectedTag = useDialecticStore(selectSelectedDomainTag); 