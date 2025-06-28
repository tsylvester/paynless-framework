import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { describe, it } from "https://deno.land/std@0.208.0/testing/bdd.ts";
import { getExtensionFromMimeType } from "./path_utils.ts";

describe("getExtensionFromMimeType", () => {
  it("should return correct extensions for common MIME types", () => {
    assertEquals(getExtensionFromMimeType("text/markdown"), ".md");
    assertEquals(getExtensionFromMimeType("application/json"), ".json");
    assertEquals(getExtensionFromMimeType("image/jpeg"), ".jpg");
    assertEquals(getExtensionFromMimeType("image/png"), ".png");
    assertEquals(getExtensionFromMimeType("application/pdf"), ".pdf");
    assertEquals(getExtensionFromMimeType("text/plain"), ".txt");
    assertEquals(getExtensionFromMimeType("text/html"), ".html");
    assertEquals(getExtensionFromMimeType("text/css"), ".css");
    assertEquals(getExtensionFromMimeType("application/javascript"), ".js");
    assertEquals(getExtensionFromMimeType("application/typescript"), ".ts");
    assertEquals(getExtensionFromMimeType("image/gif"), ".gif");
    assertEquals(getExtensionFromMimeType("image/svg+xml"), ".svg");
    assertEquals(getExtensionFromMimeType("application/xml"), ".xml");
    assertEquals(getExtensionFromMimeType("application/zip"), ".zip");
    assertEquals(getExtensionFromMimeType("text/csv"), ".csv");
    assertEquals(getExtensionFromMimeType("application/octet-stream"), ".bin");
  });

  it("should handle complex MIME types with parameters", () => {
    assertEquals(getExtensionFromMimeType("text/plain; charset=utf-8"), ".txt");
    assertEquals(getExtensionFromMimeType("application/json; profile=http://example.com/schema"), ".json");
  });

  it("should handle vendor-specific and experimental MIME types correctly", () => {
    assertEquals(getExtensionFromMimeType("application/vnd.ms-excel"), ".xls");
    assertEquals(getExtensionFromMimeType("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), ".docx");
    assertEquals(getExtensionFromMimeType("application/vnd.oasis.opendocument.text"), ".odt");
    assertEquals(getExtensionFromMimeType("application/x-custom-type"), ".custom-type"); // Assuming 'custom-type' is a valid subtype for fallback
    assertEquals(getExtensionFromMimeType("application/x-mpegURL"), ".mpegurl"); // Assuming 'mpegURL' is a valid subtype for fallback
  });

  it("should return a generic extension for unknown MIME types after attempting subtype parsing", () => {
    assertEquals(getExtensionFromMimeType("application/unknown-type"), ".unknown-type");
    assertEquals(getExtensionFromMimeType("audio/unsupported-format"), ".unsupported-format");
    assertEquals(getExtensionFromMimeType("application/vnd.very.specific-custom.format+zip"), ".zip"); // Falls back to '+zip' part
    assertEquals(getExtensionFromMimeType("application/vnd.another-really-long-custom-format-that-is-too-long-for-an-ext"), ".bin"); // Too long, defaults to .bin
  });

  it("should handle invalid or edge case inputs gracefully", () => {
    assertEquals(getExtensionFromMimeType(""), ".bin"); // Empty string
    assertEquals(getExtensionFromMimeType("invalid"), ".invalid"); // No slash, treated as subtype
    assertEquals(getExtensionFromMimeType("/"), ".bin"); // Just a slash
    assertEquals(getExtensionFromMimeType("application/"), ".bin"); // Ends with slash
    assertEquals(getExtensionFromMimeType("/json"), ".json"); // Starts with slash
    assertEquals(getExtensionFromMimeType(null as any), ".bin");
    assertEquals(getExtensionFromMimeType(undefined as any), ".bin");
    assertEquals(getExtensionFromMimeType(123 as any), ".bin");
  });

  it("should correctly parse subtypes with '+' notation", () => {
    assertEquals(getExtensionFromMimeType("image/svg+xml"), ".svg");
    assertEquals(getExtensionFromMimeType("application/ld+json"), ".json");
    assertEquals(getExtensionFromMimeType("application/atom+xml"), ".xml");
    assertEquals(getExtensionFromMimeType("application/vnd.custom+xml"), ".xml");
  });

  it("should use subtype as fallback if no specific rule matches and subtype is plausible", () => {
    assertEquals(getExtensionFromMimeType("application/my-custom-format"), ".my-custom-format");
    assertEquals(getExtensionFromMimeType("audio/aac"), ".aac");
    assertEquals(getExtensionFromMimeType("video/mp4"), ".mp4");
    assertEquals(getExtensionFromMimeType("font/woff2"), ".woff2");
  });

   it("should correctly handle MS Office MIME types (modern and older)", () => {
    assertEquals(getExtensionFromMimeType("application/msword"), ".doc");
    assertEquals(getExtensionFromMimeType("application/vnd.ms-excel"), ".xls");
    assertEquals(getExtensionFromMimeType("application/vnd.ms-powerpoint"), ".ppt");
    assertEquals(getExtensionFromMimeType("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), ".docx");
    assertEquals(getExtensionFromMimeType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), ".xlsx");
    assertEquals(getExtensionFromMimeType("application/vnd.openxmlformats-officedocument.presentationml.presentation"), ".pptx");
  });

  it("should correctly handle OpenDocument MIME types", () => {
    assertEquals(getExtensionFromMimeType("application/vnd.oasis.opendocument.text"), ".odt");
    assertEquals(getExtensionFromMimeType("application/vnd.oasis.opendocument.spreadsheet"), ".ods");
    assertEquals(getExtensionFromMimeType("application/vnd.oasis.opendocument.presentation"), ".odp");
  });
}); 