// Centralized imports to simplify file refactoring
// Re-export from auth file structure
export { authApiClient } from './api/clients/auth';
export { socialApiClient } from './api/clients/social';
export { messagingApiClient } from './api/clients/messaging';

// Re-export services
export { authService } from './services/auth';
export { socialService } from './services/social';