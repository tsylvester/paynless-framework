import { assertEquals, assertExists, assert } from 'https://deno.land/std@0.177.0/testing/asserts.ts';
// Use Spy type from Deno mock - Remove Spy import if not used elsewhere
import { assertSpyCalls, assertSpyCall, type Spy, spy, stub, type Stub } from 'https://deno.land/std@0.177.0/testing/mock.ts';
// Import Supabase types
import { User, SupabaseClient, RealtimeChannel } from 'npm:@supabase/supabase-js@^2.43.4';

// Import shared test utilities
import { createMockSupabaseClient, type MockSupabaseDataConfig } from '../_shared/test-utils.ts';

// Import the handler function (assuming signature: handler(req: Request, deps: NotificationsStreamDeps))
import { handler, handleRealtimePayload } from './index.ts';

// Import type definitions
import type { RealtimePostgresChangesPayload } from 'npm:@supabase/supabase-js@^2.43.4';
import type { Notification } from '../../../packages/types/src/notification.types.ts'; // Adjust if needed

// --- Dependency Interface --- (Simplified to use the client type)
interface NotificationsStreamDeps {
    supabaseClient: SupabaseClient; // The handler expects a SupabaseClient instance
    // Add other dependencies here if needed
}

// --- Test Setup ---
const mockUser: User = {
    id: 'test-user-id',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
};

// --- Helper function for setting up mocks for each test using shared utility ---
function setupTestEnvironment(config: MockSupabaseDataConfig = {}) {
    // Create the mock client and get spies using the shared utility
    const { client: mockSupabaseClient, spies } = createMockSupabaseClient(config);

    // Assemble the dependency object expected by the handler
    const mockDeps: NotificationsStreamDeps = {
        supabaseClient: mockSupabaseClient, // Pass the mocked client instance
    };

    // Return the dependencies and spies for assertions
    return { mockDeps, spies };
}

// --- Remove spy on Response constructor ---
// const responseSpy = spy(globalThis, 'Response');

// --- Test Suite ---

Deno.test('[notifications-stream] Missing token returns 401', async () => {
    // Setup environment with default mock config
    const { mockDeps, spies } = setupTestEnvironment();

    const request = new Request('http://localhost/api/notifications-stream', {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' },
    });

    // Pass mockDeps to handler
    const response = await handler(request, mockDeps);

    // --- Assert directly on the returned response --- 
    assertEquals(response.status, 401);
    assertEquals(response.headers.get('Content-Type'), 'application/json');
    const body = await response.json();
    assertEquals(body.error, 'Missing authentication token');
    // Ensure supabase client auth.getUser wasn't called (use the spy from the utility)
    assertSpyCalls(spies.getUserSpy, 0);

    // --- Remove manual spy restoration ---
    // responseSpy.restore();
});

Deno.test('[notifications-stream] Invalid token returns 401', async () => {
    // Setup environment, configure getUserSpy to simulate an error
    const mockError = new Error('Invalid token from mock');
    const { mockDeps, spies } = setupTestEnvironment({
        // Configure getUser to reject
        simulateAuthError: mockError,
    });

    const request = new Request('http://localhost/api/notifications-stream?token=invalid-token', {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' },
    });

    const response = await handler(request, mockDeps);

    // --- Assert directly on the returned response --- 
    assertEquals(response.status, 401);
    assertEquals(response.headers.get('Content-Type'), 'application/json');
    const body = await response.json();
    assertEquals(body.error, 'Invalid authentication token');
    // Ensure supabase client auth.getUser was called
    assertSpyCalls(spies.getUserSpy, 1);

    // --- Remove manual spy restoration ---
    // responseSpy.restore();
});

Deno.test('[notifications-stream] Valid token returns 200 and sets SSE headers', async () => {
    // Setup environment, configure getUserSpy to return mock user
    const { mockDeps, spies } = setupTestEnvironment({
        getUserResult: { data: { user: mockUser }, error: null }, // Use specific result config
    });

    const request = new Request('http://localhost/api/notifications-stream?token=valid-token', {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' },
    });

    // Handler execution might run indefinitely for SSE, we only test initial response
    const response = await handler(request, mockDeps); // Get the response directly

    // Ensure supabase client auth.getUser was called
    assertSpyCalls(spies.getUserSpy, 1);

    // --- Check Response properties directly --- 
    const responseBody = response.body; // Access body directly
    const responseOptions = {
        status: response.status,
        headers: response.headers,
    };

    assert(responseBody instanceof ReadableStream, "Response body should be a ReadableStream");
    assertEquals(responseOptions.status, 200);
    assertExists(responseOptions.headers);

    const headers = responseOptions.headers; // Already a Headers object
    assertEquals(headers.get('Content-Type'), 'text/event-stream');
    assertEquals(headers.get('Cache-Control'), 'no-cache');
    assertEquals(headers.get('Connection'), 'keep-alive');

    // --- Remove manual spy restoration ---
    // responseSpy.restore();
    
    // --- Important: Cancel the stream body to prevent resource leaks in test runner ---
    await responseBody.cancel(); 
});

Deno.test('[notifications-stream] Valid token calls supabaseClient.channel() correctly', async () => {
    // Setup environment, configure getUserSpy to return mock user
    const { mockDeps, spies } = setupTestEnvironment({
        getUserResult: { data: { user: mockUser }, error: null },
    });

    // --- Spy on the channel method specifically for this test --- 
    const channelSpy = spy(mockDeps.supabaseClient, 'channel');
    
    const request = new Request('http://localhost/api/notifications-stream?token=valid-token', {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' },
    });

    let response: Response | null = null;
    try {
        // Handler execution might run indefinitely for SSE, we only test initial setup
        response = await handler(request, mockDeps);

        // Assertions
        assertEquals(response.status, 200); // Should still be 200
        assertSpyCalls(spies.getUserSpy, 1);

        // Assert that channelSpy was called correctly
        assertSpyCalls(channelSpy, 1);
        const expectedChannelName = `notifications-user-${mockUser.id}`;
        assertEquals(channelSpy.calls[0].args[0], expectedChannelName);

    } finally {
        // Clean up stream if response was created
        if (response?.body instanceof ReadableStream) {
             await response.body.cancel();
        }
        // --- Restore the original channel method --- 
        channelSpy.restore(); 
    }
});

// --- NEW TEST --- 
Deno.test('[notifications-stream] Calls channel.subscribe() after channel creation', async () => {
    const { mockDeps, spies } = setupTestEnvironment({
        getUserResult: { data: { user: mockUser }, error: null },
    });

    // --- Use spy on a dummy function for subscribe --- 
    const dummySubscribe = () => {};
    const mockSubscribeSpy = spy(dummySubscribe);
    const localMockChannelInstance = {
        on: spy(() => localMockChannelInstance), // Chainable spy
        subscribe: mockSubscribeSpy,        // Use the spy
        unsubscribe: spy(() => Promise.resolve('ok')),
        topic: 'realtime:local-sub-test', // Keep topic for consistency
    } as unknown as RealtimeChannel;

    // --- Restore stubbing the channel method --- 
    const channelStub = stub(mockDeps.supabaseClient, 'channel', () => localMockChannelInstance);

    const request = new Request('http://localhost/api/notifications-stream?token=valid-token', {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' },
    });
    const response = await handler(request, mockDeps);

    // Assertions
    assertEquals(response.status, 200);
    assertSpyCalls(spies.getUserSpy, 1);
    assertSpyCalls(channelStub, 1); // Assert the stub was called
    assertSpyCalls(mockSubscribeSpy, 1); // Assert subscribe was called

    assert(response.body instanceof ReadableStream);
    await response.body.cancel();
    channelStub.restore(); // Restore the stub
});

// --- NEW TEST for channel.on() ---
Deno.test('[notifications-stream] Sets up channel.on() listener correctly', async () => {
    const { mockDeps, spies } = setupTestEnvironment({
        getUserResult: { data: { user: mockUser }, error: null },
    });

    // --- Spy on dummy function for .on() --- 
    // Add basic arg typing to satisfy linter for args[0]
    const mockOnSpy = spy((_arg1: any) => {}); 
    const localMockChannelInstance = {
        topic: 'realtime:local-on-test',
        on: mockOnSpy,
        subscribe: spy(() => localMockChannelInstance),
        unsubscribe: spy(() => Promise.resolve('ok')),
    } as unknown as RealtimeChannel;

    // --- Restore stubbing the channel method --- 
    const channelStub = stub(mockDeps.supabaseClient, 'channel', () => localMockChannelInstance);

    const request = new Request('http://localhost/api/notifications-stream?token=valid-token', {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' },
    });
    const response = await handler(request, mockDeps);

    // Assertions
    assertEquals(response.status, 200);
    assertSpyCalls(spies.getUserSpy, 1);
    assertSpyCalls(channelStub, 1);
    assertSpyCalls(localMockChannelInstance.subscribe as Spy<any>, 1);
    assertSpyCalls(mockOnSpy, 1);
    // Argument checking
    assertEquals(mockOnSpy.calls[0].args[0], 'postgres_changes');

    assert(response.body instanceof ReadableStream);
    await response.body.cancel();
    channelStub.restore(); // Restore the stub
});

// --- Tests for handleRealtimePayload() ---

Deno.test('[handleRealtimePayload] Enqueues correctly formatted SSE message for INSERT payload', () => {
    // 1. Setup mock controller with enqueue spy
    const mockEnqueueSpy = spy();
    const mockController = {
        enqueue: mockEnqueueSpy,
        // Add other methods/properties if needed by the function, otherwise keep minimal
        close: () => {}, 
        error: () => {}, 
        get desiredSize() { return 1; }
    } as unknown as ReadableStreamDefaultController<string>; // Cast needed

    // 2. Create mock payload
    const mockNotification: Notification = {
        id: 'noti-123',
        user_id: 'user-abc',
        type: 'test_event',
        data: { message: 'Hello SSE' },
        read: false,
        created_at: new Date().toISOString(),
    };
    const mockPayload: RealtimePostgresChangesPayload<Notification> = {
        schema: 'public',
        table: 'notifications',
        commit_timestamp: new Date().toISOString(),
        eventType: 'INSERT',
        new: mockNotification,
        old: {},
        errors: [],
    };

    // 3. Call the function
    handleRealtimePayload(mockPayload, mockController);

    // 4. Assert enqueue was called correctly
    assertSpyCalls(mockEnqueueSpy, 1);
    const expectedSSEString = `data: ${JSON.stringify(mockNotification)}\n\n`;
    assertEquals(mockEnqueueSpy.calls[0].args[0], expectedSSEString);
});

Deno.test('[handleRealtimePayload] Does not enqueue for non-INSERT payload', () => {
    // Setup mock controller
    const mockEnqueueSpy = spy();
    const mockController = { enqueue: mockEnqueueSpy } as any;

    // Create mock UPDATE payload
    const mockPayload: RealtimePostgresChangesPayload<Notification> = {
        schema: 'public',
        table: 'notifications',
        commit_timestamp: new Date().toISOString(),
        eventType: 'UPDATE', // Not INSERT
        new: { id: 'noti-456' } as any,
        old: {},
        errors: [],
    };

    handleRealtimePayload(mockPayload, mockController);

    // Assert enqueue was NOT called
    assertSpyCalls(mockEnqueueSpy, 0);
});

Deno.test('[handleRealtimePayload] Does not enqueue if payload.new is missing', () => {
    // Setup mock controller
    const mockEnqueueSpy = spy();
    const mockController = { enqueue: mockEnqueueSpy } as any;

    // Create mock INSERT payload with missing 'new'
    const mockPayload: RealtimePostgresChangesPayload<Notification> = {
        schema: 'public',
        table: 'notifications',
        commit_timestamp: new Date().toISOString(),
        eventType: 'INSERT',
        new: undefined as any, // Missing 'new'
        old: {},
        errors: [],
    };

    handleRealtimePayload(mockPayload, mockController);

    // Assert enqueue was NOT called
    assertSpyCalls(mockEnqueueSpy, 0);
});

// --- TEST for stream cancel ---
Deno.test('[handler] Calls removeChannel on stream cancel', async () => {
    const { mockDeps, spies } = setupTestEnvironment({
        getUserResult: { data: { user: mockUser }, error: null },
    });

    // --- Local mock channel instance --- 
    const localMockChannelInstance = {
        topic: 'realtime:local-cancel-test',
        on: spy(() => localMockChannelInstance),
        subscribe: spy(() => localMockChannelInstance),
        unsubscribe: spy(() => Promise.resolve('ok')),
    } as unknown as RealtimeChannel;

    // --- Restore stubbing the channel method --- 
    const channelStub = stub(mockDeps.supabaseClient, 'channel', () => localMockChannelInstance);

    // --- Use the removeChannelSpy from the default setup --- 
    const removeChannelSpy = spies.removeChannelSpy;

    const request = new Request('http://localhost/api/notifications-stream?token=valid-token', {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' },
    });
    const response = await handler(request, mockDeps);

    assertEquals(response.status, 200);
    assert(response.body instanceof ReadableStream);
    assertSpyCalls(channelStub, 1); // Assert stub call

    await response.body.cancel();

    // Assert removeChannel (from spies) was called
    assertSpyCalls(removeChannelSpy, 1);
    assertEquals(removeChannelSpy.calls[0].args[0], localMockChannelInstance);

    channelStub.restore(); // Restore the stub
});

// TODO: Add tests for:
// - Simulating client disconnect and verifying removeChannel is called in handler()
// - Potentially test error handling within handleRealtimePayload if controller.error() is used

// TODO: Add tests for:
// - Calling supabaseClient.channel (Need to check if createMockSupabaseClient provides a spy)
// - Calling channel.subscribe (Need spy on channel instance)
// - Simulating channel.on callback trigger and verifying SSE message format
// - Simulating client disconnect and verifying removeChannel is called 