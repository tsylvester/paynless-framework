import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FileType } from "../../types/file_manager.types.ts";
import {
  buildResolveTemplateFilenameErrorReturn,
  buildResolveTemplateFilenameParams,
  buildResolveTemplateFilenamePayload,
  buildResolveTemplateFilenameSuccessReturn,
  invalidateResolveTemplateFilenameErrorReturn,
  invalidateResolveTemplateFilenameParams,
  invalidateResolveTemplateFilenamePayload,
  invalidateResolveTemplateFilenameSuccessReturn,
} from "./resolveTemplateFilename.mock.ts";
import {
  isResolveTemplateFilenameErrorReturn,
  isResolveTemplateFilenameParams,
  isResolveTemplateFilenamePayload,
  isResolveTemplateFilenameSuccessReturn,
} from "./resolveTemplateFilename.guard.ts";

Deno.test(
  "isResolveTemplateFilenameParams accepts a valid params and rejects non-objects, missing fields, or corrupted dbClient",
  () => {
    const valid = buildResolveTemplateFilenameParams();
    assertEquals(isResolveTemplateFilenameParams(valid), true);

    assertEquals(isResolveTemplateFilenameParams(null), false);
    assertEquals(isResolveTemplateFilenameParams(undefined), false);
    assertEquals(isResolveTemplateFilenameParams(42), false);
    assertEquals(isResolveTemplateFilenameParams([]), false);

    const { dbClient: _, ...missingDbClient } = valid;
    assertEquals(isResolveTemplateFilenameParams(missingDbClient), false);

    assertEquals(
      isResolveTemplateFilenameParams(
        invalidateResolveTemplateFilenameParams({ dbClient: "not-object" }),
      ),
      false,
    );
  },
);

Deno.test(
  "isResolveTemplateFilenamePayload accepts a valid payload and rejects non-objects, missing fields, or corrupted fields",
  () => {
    const valid = buildResolveTemplateFilenamePayload();
    assertEquals(isResolveTemplateFilenamePayload(valid), true);

    const withOverride = buildResolveTemplateFilenamePayload({
      documentKey: FileType.feature_spec,
    });
    assertEquals(isResolveTemplateFilenamePayload(withOverride), true);

    assertEquals(isResolveTemplateFilenamePayload(null), false);
    assertEquals(isResolveTemplateFilenamePayload(undefined), false);
    assertEquals(isResolveTemplateFilenamePayload(42), false);
    assertEquals(isResolveTemplateFilenamePayload([]), false);

    const { stageSlug: _omitStage, ...missingStageSlug } = valid;
    assertEquals(isResolveTemplateFilenamePayload(missingStageSlug), false);

    const { outputType: _omitOutput, ...missingOutputType } = valid;
    assertEquals(isResolveTemplateFilenamePayload(missingOutputType), false);

    const { documentKey: _omitKey, ...missingDocumentKey } = valid;
    assertEquals(isResolveTemplateFilenamePayload(missingDocumentKey), false);

    assertEquals(
      isResolveTemplateFilenamePayload(
        invalidateResolveTemplateFilenamePayload({ stageSlug: "not-a-stage" }),
      ),
      false,
    );
    assertEquals(
      isResolveTemplateFilenamePayload(
        invalidateResolveTemplateFilenamePayload({ outputType: "not-a-type" }),
      ),
      false,
    );
    assertEquals(
      isResolveTemplateFilenamePayload(
        invalidateResolveTemplateFilenamePayload({ documentKey: "not-a-key" }),
      ),
      false,
    );
  },
);

Deno.test(
  "isResolveTemplateFilenameSuccessReturn accepts a valid success return and rejects malformed objects",
  () => {
    const valid = buildResolveTemplateFilenameSuccessReturn();
    assertEquals(isResolveTemplateFilenameSuccessReturn(valid), true);

    assertEquals(isResolveTemplateFilenameSuccessReturn(null), false);
    assertEquals(isResolveTemplateFilenameSuccessReturn(undefined), false);
    assertEquals(isResolveTemplateFilenameSuccessReturn(42), false);
    assertEquals(isResolveTemplateFilenameSuccessReturn([]), false);

    const { templateFilename: _, ...missingTemplateFilename } = valid;
    assertEquals(
      isResolveTemplateFilenameSuccessReturn(missingTemplateFilename),
      false,
    );

    assertEquals(
      isResolveTemplateFilenameSuccessReturn(
        invalidateResolveTemplateFilenameSuccessReturn({ templateFilename: 123 }),
      ),
      false,
    );
  },
);

Deno.test(
  "isResolveTemplateFilenameErrorReturn accepts a valid error return and rejects malformed objects",
  () => {
    const valid = buildResolveTemplateFilenameErrorReturn();
    assertEquals(isResolveTemplateFilenameErrorReturn(valid), true);

    assertEquals(isResolveTemplateFilenameErrorReturn(null), false);
    assertEquals(isResolveTemplateFilenameErrorReturn(undefined), false);
    assertEquals(isResolveTemplateFilenameErrorReturn(42), false);
    assertEquals(isResolveTemplateFilenameErrorReturn([]), false);

    const { error: _, ...missingError } = valid;
    assertEquals(isResolveTemplateFilenameErrorReturn(missingError), false);

    const { retriable: _r, ...missingRetriable } = valid;
    assertEquals(isResolveTemplateFilenameErrorReturn(missingRetriable), false);

    assertEquals(
      isResolveTemplateFilenameErrorReturn(
        invalidateResolveTemplateFilenameErrorReturn({ error: null }),
      ),
      false,
    );
    assertEquals(
      isResolveTemplateFilenameErrorReturn(
        invalidateResolveTemplateFilenameErrorReturn({ retriable: "false" }),
      ),
      false,
    );
  },
);

Deno.test(
  "isResolveTemplateFilenameSuccessReturn and isResolveTemplateFilenameErrorReturn are mutually exclusive",
  () => {
    const success = buildResolveTemplateFilenameSuccessReturn();
    const error = buildResolveTemplateFilenameErrorReturn();
    const both = {
      ...buildResolveTemplateFilenameSuccessReturn(),
      ...buildResolveTemplateFilenameErrorReturn(),
    };

    assertEquals(isResolveTemplateFilenameSuccessReturn(success), true);
    assertEquals(isResolveTemplateFilenameSuccessReturn(error), false);
    assertEquals(isResolveTemplateFilenameSuccessReturn(both), false);

    assertEquals(isResolveTemplateFilenameErrorReturn(error), true);
    assertEquals(isResolveTemplateFilenameErrorReturn(success), false);
    assertEquals(isResolveTemplateFilenameErrorReturn(both), false);

    assertEquals(isResolveTemplateFilenameSuccessReturn({}), false);
    assertEquals(isResolveTemplateFilenameErrorReturn({}), false);
  },
);
