import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import { useAiStore } from "./aiStore";
import { selectCurrentChatMessages } from "./aiStore.selectors";
import {
	resetMockAiApiClient,
	type MockedAiApiClient,
} from "@paynless/api/mocks";
import type { ChatApiRequest, ChatMessage, FetchOptions, Session, User } from "@paynless/types";
import { initialAiStateValues } from "@paynless/types";
import { useAuthStore } from "./authStore";
import { useWalletStore, initialWalletStateValues } from "./walletStore";
import { isSseChatEvent } from "@paynless/utils";
import {
	createSseConnectionStub,
	emitSseMessages,
	buildChatCompleteOnlySequence,
	buildChunkThenCompleteSequence,
	buildOptimisticVersusStreamedSequence,
	buildWireChatCompleteAssistantMissingIsActive,
	contractStreamingChatId,
	contractOptimisticChatId,
	contractStreamedNewChatId,
	contractStreamingAssistantMessageId,
} from "./aiStore.streaming.mock";

vi.mock("@paynless/api", async (importOriginal) => {
	const actualApiModule = await importOriginal<typeof import("@paynless/api")>();
	const { createMockAiApiClient } = await import("@paynless/api/mocks");
	const instance = createMockAiApiClient();

	const mockSupabaseAuth = {
		getSession: vi
			.fn()
			.mockResolvedValue({ data: { session: { access_token: "mock-token" } }, error: null }),
		onAuthStateChange: vi
			.fn()
			.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
	};
	const mockSupabaseClient = {
		auth: mockSupabaseAuth,
		from: vi.fn().mockReturnThis(),
		select: vi.fn().mockReturnThis(),
		insert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
	};

	const mockApiClientInstance = {
		ai: instance,
		organizations: {
			getOrganization: vi.fn(),
			getOrganizations: vi.fn(),
			createOrganization: vi.fn(),
			updateOrganization: vi.fn(),
			deleteOrganization: vi.fn(),
			getOrganizationMembers: vi.fn(),
			inviteUserToOrganization: vi.fn(),
			removeUserFromOrganization: vi.fn(),
			updateUserRoleInOrganization: vi.fn(),
			getOrganizationSettings: vi.fn(),
			updateOrganizationSettings: vi.fn(),
		},
		notifications: {
			getNotifications: vi.fn(),
			markNotificationAsRead: vi.fn(),
			markAllNotificationsAsRead: vi.fn(),
		},
		billing: {
			createCheckoutSession: vi.fn(),
			getCustomerPortalUrl: vi.fn(),
			getSubscriptions: vi.fn(),
		},
		getSupabaseClient: vi.fn(() => mockSupabaseClient),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn(),
		getFunctionsUrl: vi.fn().mockReturnValue("mock-functions-url"),
	};

	return {
		...actualApiModule,
		AiApiClient: vi.fn(() => instance),
		getApiClient: vi.fn(() => mockApiClientInstance),
		initializeApiClient: vi.fn(),
		api: {
			ai: () => instance,
		},
	};
});

const getMockAiApiInstance = async (): Promise<MockedAiApiClient> => {
	const { api } = await import("@paynless/api");
	return vi.mocked(api.ai());
};

vi.mock("./authStore");

const mockNavigateGlobal: ReturnType<typeof vi.fn> = vi.fn();

const mockUser: User = {
	id: "contract-streaming-user-id",
	email: "stream-test@example.com",
};

const mockSession: Session = {
	access_token: "mock-token",
	refresh_token: "mock-refresh-token",
	expiresAt: Date.now() + 3600000,
};

const providerIdContract: string = "contract-provider-id";
const promptIdContract: string = "contract-prompt-id";

function resetAiStoreForStreaming(): void {
	useAiStore.setState({
		...initialAiStateValues,
		messagesByChatId: {},
		selectedMessagesMap: {},
		selectedProviderId: providerIdContract,
		selectedPromptId: promptIdContract,
		newChatContext: null,
	});
}

describe("aiStore.sendStreamingMessage", () => {
	beforeEach(async () => {
		const mockAiApiInstance: MockedAiApiClient = await getMockAiApiInstance();
		vi.clearAllMocks();
		resetMockAiApiClient(mockAiApiInstance);

		act(() => {
			resetAiStoreForStreaming();
			const initialAuthState = useAuthStore.getInitialState
				? useAuthStore.getInitialState()
				: {
						user: null,
						session: null,
						profile: null,
						isLoading: false,
						error: null,
						navigate: null,
					};
			if (vi.isMockFunction(useAuthStore.getState)) {
				vi.mocked(useAuthStore.getState).mockReturnValue({
					...initialAuthState,
					user: mockUser,
					session: mockSession,
					navigate: mockNavigateGlobal,
				});
			}
			useAuthStore.setState(
				{
					...initialAuthState,
					user: mockUser,
					session: mockSession,
					navigate: mockNavigateGlobal,
				},
				true,
			);
		});

		useWalletStore.setState({
			...initialWalletStateValues,
			personalWallet: {
				walletId: "wallet-stream-test",
				balance: "1000",
				currency: "AI_TOKEN",
				createdAt: new Date(),
				updatedAt: new Date(),
				userId: mockUser.id,
			},
			isLoadingPersonalWallet: false,
			personalWalletError: null,
			currentChatWalletDecision: null,
		});

		vi.spyOn(useWalletStore.getState(), "loadPersonalWallet").mockResolvedValue(undefined);
		vi.spyOn(useWalletStore.getState(), "loadOrganizationWallet").mockResolvedValue(undefined);
	});

	it("chat_complete with full assistantMessage leaves assistant in selectCurrentChatMessages with is_active_in_thread true", async () => {
		const mockAiApiInstance: MockedAiApiClient = await getMockAiApiInstance();
		const connection = createSseConnectionStub();
		mockAiApiInstance.sendStreamingChatMessage.mockImplementation(
			async (_data: ChatApiRequest, _options?: FetchOptions) => {
				return connection;
			},
		);

		act(() => {
			useAiStore.setState({ currentChatId: contractStreamingChatId });
		});

		await act(async () => {
			await useAiStore.getState().sendStreamingMessage({
				message: "hello",
				providerId: providerIdContract,
				promptId: promptIdContract,
				chatId: contractStreamingChatId,
			});
		});

		emitSseMessages(connection, buildChatCompleteOnlySequence());

		const state = useAiStore.getState();
		const messages: ChatMessage[] = selectCurrentChatMessages(state);
		const assistant: ChatMessage | undefined = messages.find(
			(m) => m.id === contractStreamingAssistantMessageId,
		);
		expect(assistant).toBeDefined();
		expect(assistant?.is_active_in_thread).toBe(true);
		expect(state.currentChatId).toBe(contractStreamingChatId);
	});

	it("wire chat_complete missing is_active_in_thread on assistant is rejected by isSseChatEvent", () => {
		const payload: unknown = buildWireChatCompleteAssistantMissingIsActive();
		expect(isSseChatEvent(payload)).toBe(false);
	});

	it("when optimistic chat key differs from streamed chatId, messages live under streamed id and currentChatId updates", async () => {
		const mockAiApiInstance: MockedAiApiClient = await getMockAiApiInstance();
		const connection = createSseConnectionStub();
		mockAiApiInstance.sendStreamingChatMessage.mockImplementation(
			async (_data: ChatApiRequest, _options?: FetchOptions) => {
				return connection;
			},
		);

		act(() => {
			useAiStore.setState({ currentChatId: contractOptimisticChatId });
		});

		await act(async () => {
			await useAiStore.getState().sendStreamingMessage({
				message: "hello",
				providerId: providerIdContract,
				promptId: promptIdContract,
				chatId: contractOptimisticChatId,
			});
		});

		emitSseMessages(connection, buildOptimisticVersusStreamedSequence());

		const state = useAiStore.getState();
		expect(state.currentChatId).toBe(contractStreamedNewChatId);
		expect(state.messagesByChatId[contractOptimisticChatId]).toBeUndefined();
		const messages: ChatMessage[] = selectCurrentChatMessages(state);
		const assistant: ChatMessage | undefined = messages.find(
			(m) => m.role === "assistant",
		);
		expect(assistant?.chat_id).toBe(contractStreamedNewChatId);
	});

	it("content_chunk events accumulate assistant content in state before chat_complete", async () => {
		const mockAiApiInstance: MockedAiApiClient = await getMockAiApiInstance();
		const connection = createSseConnectionStub();
		mockAiApiInstance.sendStreamingChatMessage.mockImplementation(
			async (_data: ChatApiRequest, _options?: FetchOptions) => {
				return connection;
			},
		);

		const chunkSnapshots: string[] = [];

		act(() => {
			useAiStore.setState({ currentChatId: contractStreamingChatId });
		});

		await act(async () => {
			await useAiStore.getState().sendStreamingMessage(
				{
					message: "hello",
					providerId: providerIdContract,
					promptId: promptIdContract,
					chatId: contractStreamingChatId,
				},
				() => {
					const msgs: ChatMessage[] = selectCurrentChatMessages(useAiStore.getState());
					const streamingAssistant: ChatMessage | undefined = msgs.find(
						(m) =>
							m.role === "assistant" &&
							m.id === contractStreamingAssistantMessageId,
					);
					if (streamingAssistant !== undefined) {
						chunkSnapshots.push(streamingAssistant.content ?? "");
					}
				},
			);
		});

		emitSseMessages(connection, buildChunkThenCompleteSequence());

		expect(chunkSnapshots.length).toBeGreaterThanOrEqual(2);
		expect(chunkSnapshots[0]).toBe("first");
		expect(chunkSnapshots[1]).toBe("firstsecond");

		const finalMessages: ChatMessage[] = selectCurrentChatMessages(useAiStore.getState());
		const finalAssistant: ChatMessage | undefined = finalMessages.find(
			(m) => m.id === contractStreamingAssistantMessageId,
		);
		expect(finalAssistant?.content).toBe("firstsecond");
		expect(finalAssistant?.status).toBe("sent");
	});
});
