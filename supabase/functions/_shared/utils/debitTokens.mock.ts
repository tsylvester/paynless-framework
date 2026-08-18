import { stub, type Stub } from "jsr:@std/testing@0.225.1/mock";
import type {
  DebitTokens,
  DebitTokensDeps,
  DebitTokensParams,
  DebitTokensPayload,
  DebitTokensReturn,
  DebitTokensSuccess,
  DebitTokensError,
  BoundDebitTokens,
} from "./debitTokens.interface.ts";
import { buildChatMessageRow } from "../dialectic.mock.ts";

interface DebitTokensMockHolder {
  debitTokens: DebitTokens;
}

export type DebitTokensMockMethodImplementations = {
  debitTokens?: DebitTokens;
};

const getMockDebitTokensInternalDefaults =
  (): Required<DebitTokensMockMethodImplementations> => ({
    debitTokens: async (
      _deps: DebitTokensDeps,
      params: DebitTokensParams,
      _payload: DebitTokensPayload,
    ): Promise<DebitTokensReturn> => {
      const opResult = await params.databaseOperation();
      return {
        result: {
          userMessage: opResult.userMessage,
          assistantMessage: opResult.assistantMessage,
        },
        transactionRecordedSuccessfully: true,
      };
    },
  });

export interface MockDebitTokens {
  debitTokens: DebitTokens;
  stubs: {
    debitTokens: Stub<
      DebitTokensMockHolder,
      Parameters<DebitTokensMockHolder["debitTokens"]>,
      ReturnType<DebitTokensMockHolder["debitTokens"]>
    >;
  };
  clearStubs: () => void;
}

export function createMockDebitTokens(
  config: DebitTokensMockMethodImplementations = {},
): MockDebitTokens {
  const defaults: Required<DebitTokensMockMethodImplementations> =
    getMockDebitTokensInternalDefaults();

  const holder: DebitTokensMockHolder = {
    debitTokens: defaults.debitTokens,
  };

  const stubs = {
    debitTokens: stub(
      holder,
      "debitTokens",
      config.debitTokens ?? defaults.debitTokens,
    ),
  };

  const clearStubs = (): void => {
    if (
      stubs.debitTokens &&
      typeof stubs.debitTokens.restore === "function" &&
      !stubs.debitTokens.restored
    ) {
      stubs.debitTokens.restore();
    }
  };

  return {
    debitTokens: holder.debitTokens,
    stubs,
    clearStubs,
  };
}

export function createMockBoundDebitTokens(override?: BoundDebitTokens): BoundDebitTokens {
  if (override !== undefined) {
    return override;
  }
  return async (): Promise<DebitTokensReturn> => ({
    error: new Error('mock bound debitTokens not implemented'),
    retriable: false,
  });
}

// --- DebitTokensSuccess ---

export type DebitTokensSuccessOverrides = Partial<DebitTokensSuccess>;

export function buildDebitTokensSuccess(overrides?: DebitTokensSuccessOverrides): DebitTokensSuccess {
  const base: DebitTokensSuccess = {
    result: {
      userMessage: buildChatMessageRow(),
      assistantMessage: buildChatMessageRow(),
    },
    transactionRecordedSuccessfully: true,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type DebitTokensSuccessCorruptions = { [K in keyof DebitTokensSuccess]?: unknown };

export function invalidateDebitTokensSuccess(corruptions: DebitTokensSuccessCorruptions): unknown {
  return { ...buildDebitTokensSuccess(), ...corruptions };
}

// --- DebitTokensError ---

export type DebitTokensErrorOverrides = Partial<DebitTokensError>;

export function buildDebitTokensError(overrides?: DebitTokensErrorOverrides): DebitTokensError {
  const base: DebitTokensError = {
    error: new Error('debit tokens error'),
    retriable: false,
  };
  return overrides ? { ...base, ...overrides } : base;
}

export type DebitTokensErrorCorruptions = { [K in keyof DebitTokensError]?: unknown };

export function invalidateDebitTokensError(corruptions: DebitTokensErrorCorruptions): unknown {
  return { ...buildDebitTokensError(), ...corruptions };
}
