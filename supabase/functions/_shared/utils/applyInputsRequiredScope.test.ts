import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ResourceDocument } from "../types.ts";
import { InputRule } from "../../dialectic-service/dialectic.interface.ts";
import { FileType } from "../types/file_manager.types.ts";
import { applyInputsRequiredScope } from "./applyInputsRequiredScope.ts";

Deno.test("applyInputsRequiredScope", async (t: Deno.TestContext) => {
    // ── Fixtures ──────────────────────────────────────────────────────
    const docA: Required<ResourceDocument> = {
        id: "doc-a-id",
        content: "Document A content",
        document_key: FileType.business_case,
        stage_slug: "thesis",
        type: "document",
    };
    const docB: Required<ResourceDocument> = {
        id: "doc-b-id",
        content: "Document B content",
        document_key: FileType.UserFeedback,
        stage_slug: "antithesis",
        type: "feedback",
    };
    const docC: Required<ResourceDocument> = {
        id: "doc-c-id",
        content: "Document C content",
        document_key: FileType.HeaderContext,
        stage_slug: "synthesis",
        type: "header_context",
    };

    const ruleMatchingA: InputRule = {
        type: "document",
        slug: "thesis",
        document_key: FileType.business_case,
    };
    const ruleMatchingB: InputRule = {
        type: "feedback",
        slug: "antithesis",
        document_key: FileType.UserFeedback,
    };
    const ruleMatchingC: InputRule = {
        type: "header_context",
        slug: "synthesis",
        document_key: FileType.HeaderContext,
    };
    const ruleMatchingNone: InputRule = {
        type: "document",
        slug: "paralysis",
        document_key: FileType.GeneralResource,
    };

    // ── Tests ─────────────────────────────────────────────────────────

    await t.step("returns empty array when inputsRequired is empty", () => {
        const result: Required<ResourceDocument>[] = applyInputsRequiredScope([docA, docB], []);
        assertEquals(result, []);
    });

    await t.step("returns empty array when inputsRequired is undefined", () => {
        const result: Required<ResourceDocument>[] = applyInputsRequiredScope([docA, docB], undefined);
        assertEquals(result, []);
    });

    await t.step("returns matching documents when rules align on type, slug/stage_slug, and document_key", () => {
        const result: Required<ResourceDocument>[] = applyInputsRequiredScope(
            [docA, docB, docC],
            [ruleMatchingA, ruleMatchingB],
        );
        assertEquals(result, [docA, docB]);
    });

    await t.step("excludes documents that do not match any rule", () => {
        const result: Required<ResourceDocument>[] = applyInputsRequiredScope(
            [docA, docB, docC],
            [ruleMatchingA],
        );
        assertEquals(result, [docA]);
    });

    await t.step("handles partial matches — same type and slug but different document_key — excludes correctly", () => {
        const partialRule: InputRule = {
            type: "document",
            slug: "thesis",
            document_key: FileType.feature_spec,
        };
        const result: Required<ResourceDocument>[] = applyInputsRequiredScope([docA], [partialRule]);
        assertEquals(result, []);
    });

    await t.step("returns empty array when no documents match any rule", () => {
        const result: Required<ResourceDocument>[] = applyInputsRequiredScope(
            [docA, docB, docC],
            [ruleMatchingNone],
        );
        assertEquals(result, []);
    });

    await t.step("returns all documents when every document matches a rule", () => {
        const result: Required<ResourceDocument>[] = applyInputsRequiredScope(
            [docA, docB, docC],
            [ruleMatchingA, ruleMatchingB, ruleMatchingC],
        );
        assertEquals(result, [docA, docB, docC]);
    });

    await t.step("does not match when rule.document_key is undefined — strict equality excludes documents", () => {
        const undefinedKeyRule: InputRule = {
            type: "document",
            slug: "thesis",
        };
        const result: Required<ResourceDocument>[] = applyInputsRequiredScope([docA], [undefinedKeyRule]);
        assertEquals(result, []);
    });
});
