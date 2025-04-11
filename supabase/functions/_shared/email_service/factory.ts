import { logger } from "../logger.ts";
import { KitService, type KitServiceConfig } from "./kit_service.ts";
import { NoOpService } from "./no_op_service.ts";
import { type IEmailMarketingService } from "../types.ts";
import { DummyEmailService } from './dummy_service.ts';

// Define the configuration structure expected by the factory
export interface EmailFactoryConfig {
    provider?: string | null;
    // Include all Kit config options, explicitly marking them as potentially undefined
    kitApiKey?: string | null;
    kitBaseUrl?: string | null;
    kitTagId?: string | null;
    kitCustomUserIdField?: string | null;
    kitCustomCreatedAtField?: string | null;
}

/**
 * Gets the configured email marketing service instance based on provided config.
 * 
 * @param config The configuration object containing provider and service-specific settings.
 * @returns An instance implementing IEmailMarketingService, or null if configuration is invalid.
 */
export function getEmailMarketingService(config: EmailFactoryConfig): IEmailMarketingService | null {
    const provider = config.provider?.toLowerCase();
    logger.info(`Attempting to initialize email marketing service for provider: ${provider || 'None'}`);

    try {
        if (provider === "kit") {
            // Create Kit config from the factory config
            const kitConfig: KitServiceConfig = {
                apiKey: config.kitApiKey || "", // Pass empty string if null/undefined
                baseUrl: config.kitBaseUrl || "",
                tagId: config.kitTagId || undefined,
                customUserIdField: config.kitCustomUserIdField || undefined,
                customCreatedAtField: config.kitCustomCreatedAtField || undefined,
            };
            // Pass extracted config to constructor
            return new KitService(kitConfig); 
        } else if (provider === "none") {
            return new NoOpService();
        } else if (!provider || provider === "dummy") {
            logger.warn(`Email marketing provider is '${provider || 'undefined'}'. Using DummyEmailService.`);
            return new DummyEmailService();
        } else {
             logger.warn(`Unsupported email marketing provider: ${provider}. Email marketing disabled.`);
             return null; // Unsupported provider explicitly returns null
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error("Failed to initialize email marketing service:", { provider, error: errorMessage });
        return null; // Return null if initialization fails
    }
} 