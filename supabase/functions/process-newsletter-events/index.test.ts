import { assertEquals } from "jsr:@std/assert";
import { spy } from "jsr:@std/testing/mock";
import { type EmailMarketingService } from "../_shared/types.ts";
import { handler } from "./index.ts";

// Mock Supabase client
function createMockSupabaseClient(
  events: any[] = [],
  users: Record<string, any> = {},
  updateSuccess = true
) {
  const processedEvents = new Set<string>();
  
  return {
    from: (table: string) => {
      if (table === 'newsletter_events') {
        return {
          select: () => ({
            is: () => ({
              order: () => ({
                data: events.filter(e => !processedEvents.has(e.id)),
                error: null
              })
            })
          }),
          update: (data: any) => ({
            eq: (field: string, value: string) => {
              if (updateSuccess && field === 'id') {
                processedEvents.add(value);
                return { error: null };
              }
              return { error: updateSuccess ? null : { message: 'Update failed' } };
            }
          })
        };
      }
      return null;
    },
    auth: {
      admin: {
        getUserById: async (userId: string) => {
          const user = users[userId];
          if (user) {
            return { data: { user }, error: null };
          }
          return { data: null, error: { message: 'User not found' } };
        }
      }
    }
  };
}

// Mock email service
function createMockEmailService() {
  const addUserToListSpy = spy(async () => {});
  const addTagToSubscriberSpy = spy(async () => {});
  const removeTagFromSubscriberSpy = spy(async () => {});
  
  return {
    service: {
      addUserToList: addUserToListSpy,
      updateUserAttributes: spy(async () => {}),
      removeUser: spy(async () => {}),
      addTagToSubscriber: addTagToSubscriberSpy,
      removeTagFromSubscriber: removeTagFromSubscriberSpy,
    } as EmailMarketingService,
    addUserToListSpy,
    addTagToSubscriberSpy,
    removeTagFromSubscriberSpy
  };
}

// Test data
const mockUser1 = {
  id: 'user-1',
  email: 'user1@example.com',
  created_at: '2024-01-01T00:00:00Z',
  user_metadata: { firstName: 'John', lastName: 'Doe' }
};

const mockUser2 = {
  id: 'user-2',
  email: 'user2@example.com',
  created_at: '2024-01-02T00:00:00Z',
  user_metadata: {}
};

Deno.test("process-newsletter-events tests", async (t) => {
  // Mock request (not used in this handler but required for signature)
  const mockRequest = new Request("http://localhost/process-newsletter-events");

  await t.step("should process subscribe event with unknown ref (skip tagging)", async () => {
    const events = [{
      id: 'event-2',
      user_id: 'user-2',
      event_type: 'subscribe',
      created_at: '2024-01-02T00:00:00Z',
      processed_at: null,
      ref: 'unknown-ref'
    }];
    
    const users = { 'user-2': mockUser2 };
    const supabaseClient = createMockSupabaseClient(events, users);
    const { service, addUserToListSpy, addTagToSubscriberSpy } = createMockEmailService();

    const response = await handler(mockRequest, { 
      supabaseClient: supabaseClient as any, 
      emailService: service 
    });

    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.processed, 1);
    
    // User should still be added to list
    assertEquals(addUserToListSpy.calls.length, 1);
    // But no tag should be added (unknown ref returns null from getTagIdForRef)
    assertEquals(addTagToSubscriberSpy.calls.length, 0);
  });

  await t.step("should skip already processed events", async () => {
    const events = [{
      id: 'event-4',
      user_id: 'user-1',
      event_type: 'subscribe',
      created_at: '2024-01-04T00:00:00Z',
      processed_at: '2024-01-04T01:00:00Z', // Already processed
      ref: 'direct'
    }];
    
    const supabaseClient = createMockSupabaseClient([], {}); // Empty events (filtered out)
    const { service, addUserToListSpy } = createMockEmailService();

    const response = await handler(mockRequest, { 
      supabaseClient: supabaseClient as any, 
      emailService: service 
    });

    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.message, 'No events to process');
    assertEquals(body.processed, 0);
    
    // No Kit calls should be made
    assertEquals(addUserToListSpy.calls.length, 0);
  });

  await t.step("should handle Kit API failure gracefully", async () => {
    const events = [{
      id: 'event-5',
      user_id: 'user-1',
      event_type: 'subscribe',
      created_at: '2024-01-05T00:00:00Z',
      processed_at: null,
      ref: 'startup'
    }];
    
    const users = { 'user-1': mockUser1 };
    const supabaseClient = createMockSupabaseClient(events, users, true);
    
    // Create email service that throws error
    const erroringService: EmailMarketingService = {
      addUserToList: spy(async () => { throw new Error('Kit API error'); }),
      updateUserAttributes: spy(async () => {}),
      removeUser: spy(async () => {}),
      addTagToSubscriber: spy(async () => {}),
      removeTagFromSubscriber: spy(async () => {}),
    };

    const response = await handler(mockRequest, { 
      supabaseClient: supabaseClient as any, 
      emailService: erroringService 
    });

    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.processed, 0);
    assertEquals(body.failed, 1);
  });

  await t.step("should return success with empty queue", async () => {
    const supabaseClient = createMockSupabaseClient([], {});
    const { service } = createMockEmailService();

    const response = await handler(mockRequest, { 
      supabaseClient: supabaseClient as any, 
      emailService: service 
    });

    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.message, 'No events to process');
    assertEquals(body.processed, 0);
    assertEquals(body.failed, 0);
    assertEquals(body.skipped, 0);
  });

  await t.step("should handle multiple pending events in batch", async () => {
    const events = [
      {
        id: 'event-6',
        user_id: 'user-1',
        event_type: 'subscribe',
        created_at: '2024-01-06T00:00:00Z',
        processed_at: null,
        ref: 'agency'
      },
      {
        id: 'event-7',
        user_id: 'user-2',
        event_type: 'subscribe',
        created_at: '2024-01-06T01:00:00Z',
        processed_at: null,
        ref: 'pricing'
      }
    ];
    
    const users = { 
      'user-1': mockUser1,
      'user-2': mockUser2 
    };
    const supabaseClient = createMockSupabaseClient(events, users);
    const { service, addUserToListSpy } = createMockEmailService();

    const response = await handler(mockRequest, { 
      supabaseClient: supabaseClient as any, 
      emailService: service 
    });

    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.processed, 2);
    assertEquals(body.failed, 0);
    
    // Both users should be added
    assertEquals(addUserToListSpy.calls.length, 2);
  });

  await t.step("should process subscribe events with valid segment refs", async () => {
    const events = [{
      id: 'event-8',
      user_id: 'user-1',
      event_type: 'subscribe',
      created_at: '2024-01-07T00:00:00Z',
      processed_at: null,
      ref: 'vibecoder'
    }];
    
    const users = { 'user-1': mockUser1 };
    const supabaseClient = createMockSupabaseClient(events, users);
    const { service, addUserToListSpy, addTagToSubscriberSpy } = createMockEmailService();

    const response = await handler(mockRequest, { 
      supabaseClient: supabaseClient as any, 
      emailService: service 
    });

    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.processed, 1);
    
    // User should be added
    assertEquals(addUserToListSpy.calls.length, 1);
    assertEquals(addUserToListSpy.calls[0].args[0].email, 'user1@example.com');
    
    // Tag should be added (since vibecoder exists in the config)
    assertEquals(addTagToSubscriberSpy.calls.length, 1);
    assertEquals(addTagToSubscriberSpy.calls[0].args[0], 'user1@example.com');
    // The actual tag ID would be PLACEHOLDER_VIBECODER_TAG_ID from the config
    assertEquals(addTagToSubscriberSpy.calls[0].args[1], 'PLACEHOLDER_VIBECODER_TAG_ID');
  });

  await t.step("should handle user not found gracefully", async () => {
    const events = [{
      id: 'event-9',
      user_id: 'non-existent-user',
      event_type: 'subscribe',
      created_at: '2024-01-08T00:00:00Z',
      processed_at: null,
      ref: 'direct'
    }];
    
    const users = {}; // No users
    const supabaseClient = createMockSupabaseClient(events, users);
    const { service, addUserToListSpy } = createMockEmailService();

    const response = await handler(mockRequest, { 
      supabaseClient: supabaseClient as any, 
      emailService: service 
    });

    assertEquals(response.status, 200);
    const body = await response.json();
    assertEquals(body.processed, 0);
    assertEquals(body.failed, 1); // User not found counts as failed
    
    // No Kit calls should be made
    assertEquals(addUserToListSpy.calls.length, 0);
  });
});