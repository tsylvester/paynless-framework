// Export API client modules
export * from './apiClient'; // Ensure this points to the correct file
export * from './stripe.api'; 
export * from './ai.api'; // Export AiApiClient 
export * from './organizations.api'; // Export Org API client 

// Export the ApiClient class definition (useful for type checking)
export { ApiClient } from './apiClient';

// ---> Export the provider and hook from ApiContext <---
export { ApiProvider, useApi } from './ApiContext';

// ---> NO LONGER export the old singleton instance or config function <--- 
// export { api, initializeApiClient, configureApiClient, _resetApiClient } from './apiClient';