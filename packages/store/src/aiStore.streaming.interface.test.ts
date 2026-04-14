import { describe, it, expect } from "vitest";
import type {
	ContentChunkSequenceContract,
	HappyPathChatCompleteContract,
	OptimisticVersusStreamedChatIdContract,
} from "./aiStore.streaming.interface";
import {
	buildContentChunkAccumulationSequence,
	buildHappyPathChatCompleteEvent,
	buildOptimisticVersusStreamedChatIdFixture,
} from "./aiStore.streaming.mock";

describe("aiStore.streaming.interface contract", () => {
	it("happy path chat_complete with full assistant row conforms to HappyPathChatCompleteContract", () => {
		const payload: HappyPathChatCompleteContract =
			buildHappyPathChatCompleteEvent();
		expect(payload.type).toBe("chat_complete");
		expect(payload.assistantMessage.is_active_in_thread).toBe(true);
	});

	it("content_chunk sequence conforms to ContentChunkSequenceContract", () => {
		const sequence: ContentChunkSequenceContract =
			buildContentChunkAccumulationSequence();
		expect(sequence.length).toBe(2);
		expect(sequence[0].type).toBe("content_chunk");
		expect(sequence[1].type).toBe("content_chunk");
	});

	it("optimistic chat id versus streamed chat id fixture conforms to OptimisticVersusStreamedChatIdContract", () => {
		const mismatch: OptimisticVersusStreamedChatIdContract =
			buildOptimisticVersusStreamedChatIdFixture();
		expect(mismatch.optimisticMessageChatId).not.toBe(mismatch.streamedChatId);
		expect(mismatch.chatStart.chatId).toBe(mismatch.streamedChatId);
		expect(mismatch.chatComplete.type).toBe("chat_complete");
	});
});
