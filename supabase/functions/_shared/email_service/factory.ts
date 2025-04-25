import { logger } from "../logger.ts";
import { type EmailMarketingService } from "../types.ts";
import { KitService, type KitServiceConfig } from "./kit_service.ts";
import { NoOpEmailService } from "./no_op_service.ts";
import { DummyEmailService } from './dummy_service.ts';

// Interface for the configuration object passed to the factory
export interface EmailFactoryConfig {
  provider?: string;
  kitApiKey?: string;
  kitBaseUrl?: string;
  kitTagId?: string;
  kitCustomUserIdField?: string;
  kitCustomCreatedAtField?: string;
  // Add fields for other potential providers here
}

/**
 * Factory function to get the appropriate email marketing service based on config.
 * Reads configuration values from the passed config object.
 * 
 * @param config Configuration object containing provider info and API keys/settings.
 * @returns An instance of EmailMarketingService (either KitService or NoOpEmailService).
 */
export function getEmailMarketingService(config: EmailFactoryConfig): EmailMarketingService {
  logger.debug("getEmailMarketingService called with config:", { provider: config.provider });

  if (config.provider?.toLowerCase() === 'kit') {
    logger.info("Attempting to configure KitService...");
    // Check for required fields for KitService
    if (
      config.kitApiKey &&
      config.kitBaseUrl &&
      config.kitTagId && // Tag ID is required by addUserToList
      config.kitCustomUserIdField && 
      config.kitCustomCreatedAtField
    ) {
      const kitConfig: KitServiceConfig = {
        apiKey: config.kitApiKey,
        baseUrl: config.kitBaseUrl,
        tagId: config.kitTagId,
        customUserIdField: config.kitCustomUserIdField,
        customCreatedAtField: config.kitCustomCreatedAtField,
      };
      try {
        logger.info("KitService configured successfully. Returning instance.");
        return new KitService(kitConfig);
      } catch (error) {
        // Catch potential constructor errors (though we pre-validated required fields)
        logger.error("Error instantiating KitService even with valid config check", { 
            error: error instanceof Error ? error.message : String(error) 
        });
      }
    } else {
      logger.warn("Kit provider configured, but missing required settings (apiKey, baseUrl, tagId, custom fields). Falling back to NoOpService.");
    }
  } else if (config.provider && config.provider.toLowerCase() !== 'none') {
      logger.warn(`Unknown EMAIL_MARKETING_PROVIDER specified: '${config.provider}'. Falling back to NoOpService.`);
  }

  // Default to NoOpService if provider is not 'kit', is 'none', or Kit config is incomplete
  logger.info("Returning NoOpEmailService instance.");
  return new NoOpEmailService();
} 