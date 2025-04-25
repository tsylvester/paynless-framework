import { assertEquals, assertExists, assertInstanceOf, assertStrictEquals } from "jsr:@std/assert";
import { getEmailMarketingService, type EmailFactoryConfig } from "./factory.ts";
import { KitService } from "./kit_service.ts";
import { NoOpEmailService } from "./no_op_service.ts";
import { type EmailMarketingService } from "../types.ts";

// Define mock Kit config values
const mockKitApiKey = "fake-key";
const mockKitBaseUrl = "https://fake-kit.com";
const mockKitTagId = "fake-tag";
const mockKitUserIdField = "fields[user_id]";
const mockKitCreatedAtField = "fields[created_at]";

// Base config for Kit provider for tests
const baseKitConfig: EmailFactoryConfig = {
    provider: 'kit', 
    kitApiKey: mockKitApiKey,
    kitBaseUrl: mockKitBaseUrl,
    kitTagId: mockKitTagId,
    kitCustomUserIdField: mockKitUserIdField,
    kitCustomCreatedAtField: mockKitCreatedAtField,
};

// Define a base valid config for Kit for reuse
const validKitConfig: EmailFactoryConfig = {
    provider: "kit",
    kitApiKey: "test-key",
    kitBaseUrl: "https://test.kit.api",
    kitTagId: "12345",
    kitCustomUserIdField: "cf_user_id",
    kitCustomCreatedAtField: "cf_created_at",
};

// Removed the outdated "Email Marketing Service Factory Tests (DI)" suite

// Correct and passing test suite
Deno.test("Email Marketing Service Factory Tests", async (t) => {

    await t.step("should return KitService when provider is 'kit' and config is valid", () => {
        const service: EmailMarketingService = getEmailMarketingService(validKitConfig);
        assertInstanceOf(service, KitService, "Service should be an instance of KitService");
    });

    await t.step("should return NoOpEmailService when provider is not specified (undefined)", () => {
        const config: EmailFactoryConfig = { provider: undefined }; // Explicitly undefined
        const service: EmailMarketingService = getEmailMarketingService(config);
        assertInstanceOf(service, NoOpEmailService, "Service should be an instance of NoOpEmailService");
    });

     await t.step("should return NoOpEmailService when provider is empty string", () => {
        const config: EmailFactoryConfig = { provider: '' }; // Empty string
        const service: EmailMarketingService = getEmailMarketingService(config);
        assertInstanceOf(service, NoOpEmailService, "Service should be an instance of NoOpEmailService");
    });

    await t.step("should return NoOpEmailService when provider is 'none'", () => {
        const config: EmailFactoryConfig = { provider: "none" };
        const service: EmailMarketingService = getEmailMarketingService(config);
        assertInstanceOf(service, NoOpEmailService, "Service should be an instance of NoOpEmailService");
    });

    await t.step("should return NoOpEmailService when provider is 'kit' but apiKey is missing", () => {
        const config: EmailFactoryConfig = { ...validKitConfig, kitApiKey: undefined }; 
        const service: EmailMarketingService = getEmailMarketingService(config);
        assertInstanceOf(service, NoOpEmailService, "Fallback to NoOpService expected");
    });

    await t.step("should return NoOpEmailService when provider is 'kit' but baseUrl is missing", () => {
        const config: EmailFactoryConfig = { ...validKitConfig, kitBaseUrl: undefined };
        const service: EmailMarketingService = getEmailMarketingService(config);
        assertInstanceOf(service, NoOpEmailService, "Fallback to NoOpService expected");
    });

    await t.step("should return NoOpEmailService when provider is 'kit' but tagId is missing", () => {
        const config: EmailFactoryConfig = { ...validKitConfig, kitTagId: undefined };
        const service: EmailMarketingService = getEmailMarketingService(config);
        assertInstanceOf(service, NoOpEmailService, "Fallback to NoOpService expected");
    });

    await t.step("should return NoOpEmailService when provider is 'kit' but customUserIdField is missing", () => {
        const config: EmailFactoryConfig = { ...validKitConfig, kitCustomUserIdField: undefined };
        const service: EmailMarketingService = getEmailMarketingService(config);
        assertInstanceOf(service, NoOpEmailService, "Fallback to NoOpService expected");
    });

     await t.step("should return NoOpEmailService when provider is 'kit' but customCreatedAtField is missing", () => {
        const config: EmailFactoryConfig = { ...validKitConfig, kitCustomCreatedAtField: undefined };
        const service: EmailMarketingService = getEmailMarketingService(config);
        assertInstanceOf(service, NoOpEmailService, "Fallback to NoOpService expected");
    });

    await t.step("should return NoOpEmailService for an unknown provider", () => {
        const config: EmailFactoryConfig = { provider: "mailchimp" }; // Unknown provider
        const service: EmailMarketingService = getEmailMarketingService(config);
        assertInstanceOf(service, NoOpEmailService, "Fallback to NoOpService expected for unknown provider");
    });

    await t.step("should be case-insensitive for 'kit' provider", () => {
        const config: EmailFactoryConfig = { ...validKitConfig, provider: "KiT" }; // Different case
        const service: EmailMarketingService = getEmailMarketingService(config);
        assertInstanceOf(service, KitService, "Provider check should be case-insensitive");
    });

    await t.step("should be case-insensitive for 'none' provider", () => {
        const config: EmailFactoryConfig = { provider: "NoNe" }; // Different case
        const service: EmailMarketingService = getEmailMarketingService(config);
        assertInstanceOf(service, NoOpEmailService, "Provider check should be case-insensitive");
    });

}); 