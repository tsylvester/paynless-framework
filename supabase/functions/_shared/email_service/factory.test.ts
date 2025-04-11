import { assertEquals, assertExists, assertInstanceOf, assertStrictEquals } from "jsr:@std/assert";
import { getEmailMarketingService, type EmailFactoryConfig } from "./factory.ts";
import { KitService } from "./kit_service.ts";
import { NoOpService } from "./no_op_service.ts";
import { DummyEmailService } from "./dummy_service.ts";
import { type IEmailMarketingService } from "../types.ts";

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

Deno.test("Email Marketing Service Factory Tests (DI)", async (t) => {

  await t.step("`getEmailMarketingService` returns KitService when provider='kit' with valid config", async () => {
    // Call factory directly with full Kit config
    const service = getEmailMarketingService(baseKitConfig);
    assertExists(service);
    assertInstanceOf(service, KitService, "Service should be KitService");
  });

  await t.step("`getEmailMarketingService` returns NoOpService when provider='none'", async () => {
    // Call factory directly with provider set to 'none'
    const service = getEmailMarketingService({ provider: 'none' });
    assertExists(service);
    assertInstanceOf(service, NoOpService, "Service should be NoOpService");
  });

  await t.step("`getEmailMarketingService` returns DummyEmailService for default cases", async (innerT) => {
    await innerT.step("Provider undefined", async () => { 
        // Call factory with provider explicitly undefined
        const service = getEmailMarketingService({ provider: undefined });
        assertExists(service);
        assertInstanceOf(service, DummyEmailService, "Service should be DummyEmailService (undefined)"); 
    });
    await innerT.step("Provider null", async () => { 
        // Call factory with provider explicitly null
        const service = getEmailMarketingService({ provider: null });
        assertExists(service);
        assertInstanceOf(service, DummyEmailService, "Service should be DummyEmailService (null)"); 
    });
    await innerT.step("Provider empty string", async () => {
        // Call factory with provider as empty string
        const service = getEmailMarketingService({ provider: '' });
        assertExists(service);
        assertInstanceOf(service, DummyEmailService, "Service should be DummyEmailService (empty string)");
    });
    await innerT.step("Provider 'dummy'", async () => {
        // Call factory with provider explicitly 'dummy'
        const service = getEmailMarketingService({ provider: 'dummy' });
        assertExists(service);
        assertInstanceOf(service, DummyEmailService, "Service should be DummyEmailService ('dummy')");
    });
  });

  await t.step("`getEmailMarketingService` returns null for unknown provider", async () => {
    // Call factory with an unsupported provider string
    const service = getEmailMarketingService({ provider: 'mailchimp' }); 
    assertStrictEquals(service, null, "Service should be null for unknown provider");
   });

  await t.step("`getEmailMarketingService` returns null if 'kit' provider config is incomplete", async (innerT) => {
    // Test various missing required fields for Kit
    await innerT.step("Missing kitApiKey", async () => {
        const service = getEmailMarketingService({ ...baseKitConfig, kitApiKey: undefined });
        assertStrictEquals(service, null, "Service should be null if Kit API key is missing");
    });
    await innerT.step("Missing kitBaseUrl", async () => {
        const service = getEmailMarketingService({ ...baseKitConfig, kitBaseUrl: null });
        assertStrictEquals(service, null, "Service should be null if Kit Base URL is missing");
    });
    await innerT.step("Missing kitCustomUserIdField", async () => {
        // Constructor throws if custom fields are missing
        const service = getEmailMarketingService({ ...baseKitConfig, kitCustomUserIdField: undefined });
        assertStrictEquals(service, null, "Service should be null if Kit User ID Field is missing");
    });
     await innerT.step("Missing kitCustomCreatedAtField", async () => {
        // Constructor throws if custom fields are missing
        const service = getEmailMarketingService({ ...baseKitConfig, kitCustomCreatedAtField: undefined });
        assertStrictEquals(service, null, "Service should be null if Kit Created At Field is missing");
    });
    // Note: tagId is optional for the KitService constructor, so missing it doesn't return null here
     await innerT.step("Missing optional kitTagId (should still return KitService)", async () => {
        const service = getEmailMarketingService({ ...baseKitConfig, kitTagId: undefined });
        assertExists(service);
        assertInstanceOf(service, KitService, "Service should still be KitService even if optional Tag ID is missing");
    });
  });

}); 