import { http, HttpResponse } from 'msw';
import type { AuthResponse, ProfileResponse, UserProfile, SubscriptionPlan, UserSubscription, Chat, ChatMessage } from '@paynless/types';

// Base URL used in tests - <<< Use Environment Variable >>>
const supabaseUrlFromEnv = process.env.VITE_SUPABASE_URL;
if (!supabaseUrlFromEnv) {
  throw new Error('[MSW Handlers] VITE_SUPABASE_URL environment variable not set.');
}
const API_BASE_URL = `${supabaseUrlFromEnv.replace(/\/$/, '')}/functions/v1`;
console.log(`[MSW Handlers] Using API_BASE_URL: ${API_BASE_URL}`);

// Mock Data (Can be expanded or imported)
const mockUserProfile: UserProfile = {
  id: 'test-user-id',
  // email: 'test@example.com', // Email is part of User, not Profile table
  first_name: 'Test',
  last_name: 'User',
  role: 'user', created_at: 'date', updatedAt: 'date'
};

const mockPlansData: SubscriptionPlan[] = [
  { id: 'plan_basic', stripePriceId: 'price_basic', name: 'Basic', amount: 1000, currency: 'usd', interval: 'month', intervalCount: 1, active: true, createdAt: 'date', updatedAt: 'date', description: { subtitle:'', features:[]}, metadata: null, stripeProductId: 'prod_basic' },
  { id: 'plan_pro', stripePriceId: 'price_pro', name: 'Pro', amount: 2500, currency: 'usd', interval: 'month', intervalCount: 1, active: true, createdAt: 'date', updatedAt: 'date', description: { subtitle:'', features:[]}, metadata: null, stripeProductId: 'prod_pro' }
];

let mockCurrentSubscription: UserSubscription | null = null; // State for current subscription tests

export const handlers = [
  // --- Auth endpoints ---
  // Corrected path: /login
  http.post(`${API_BASE_URL}/login`, async ({ request }) => {
    const { email, password } = await request.json() as any;

    if (email === 'test@example.com' && password === 'wrongpass') {
      return HttpResponse.json({ error: { message: 'Invalid credentials' } }, { status: 401 });
    }

    if (email === 'test@example.com' && password === 'password123') {
       const response: AuthResponse = {
          user: { id: 'test-user-id', email: email, created_at: 'date' },
          session: { access_token: 'test-access-token', refresh_token: 'test-refresh-token', expires_in: 3600, token_type: 'bearer', user: {id: 'test-user-id'} },
          profile: mockUserProfile
       }
      return HttpResponse.json(response, { status: 200 });
    }

    return HttpResponse.json({ error: { message: 'Login failed' } }, { status: 500 });
  }),

  // Corrected path: /register
  http.post(`${API_BASE_URL}/register`, async ({ request }) => {
    const { email } = await request.json() as any;

    if (email === 'test@example.com') {
      return HttpResponse.json({ error: { message: 'Email already exists' } }, { status: 400 }); // Use 409 Conflict?
    }

    const response: Partial<AuthResponse> = {
        user: { id: 'new-user-id', email: email, created_at: 'date' },
        session: { access_token: 'new-access-token', refresh_token: 'new-refresh-token', expires_in: 3600, token_type: 'bearer', user: { id: 'new-user-id' } },
        profile: null // Profile created by trigger usually
    }
    return HttpResponse.json(response, { status: 200 }); // Or 201
  }),

  // --- Profile endpoints ---
  // Corrected path: /me (Assuming GET /me fetches current user profile)
  http.get(`${API_BASE_URL}/me`, async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    }
    // /me likely returns the profile directly, or maybe User + Profile?
    // Let's assume it returns UserProfile for now, adjust if AuthStore expects differently
    return HttpResponse.json(mockUserProfile, { status: 200 });
  }),

  // Corrected path: /me (Assuming PUT /me updates current user profile)
  http.put(`${API_BASE_URL}/me`, async ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    }

    const updatedData = await request.json() as any;
    const response: UserProfile = { ...mockUserProfile, ...updatedData };
    return HttpResponse.json(response, { status: 200 });
  }),

  // --- Subscription endpoints (Paths seem correct based on README) ---
  http.get(`${API_BASE_URL}/api-subscriptions/plans`, async ({ request }) => {
       return HttpResponse.json(mockPlansData, { status: 200 });
  }),

  http.get(`${API_BASE_URL}/api-subscriptions/current`, async ({ request }) => {
       const authHeader = request.headers.get('Authorization');
       if (!authHeader || !authHeader.startsWith('Bearer ')) {
           return HttpResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
       }
       if (mockCurrentSubscription) {
           return HttpResponse.json(mockCurrentSubscription, { status: 200 });
       } else {
           return HttpResponse.json(null, { status: 404 });
       }
  }),

   http.post(`${API_BASE_URL}/api-subscriptions/checkout`, async ({ request }) => {
       const authHeader = request.headers.get('Authorization');
       if (!authHeader || !authHeader.startsWith('Bearer ')) {
           return HttpResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
       }
       const body = await request.json() as any;
       if (!body?.priceId) {
            return HttpResponse.json({ error: { message: 'Missing priceId' } }, { status: 400 });
       }
       return HttpResponse.json({ sessionId: `cs_test_${body.priceId}` }, { status: 200 });
   }),

   http.post(`${API_BASE_URL}/api-subscriptions/billing-portal`, async ({ request }) => {
       const authHeader = request.headers.get('Authorization');
       if (!authHeader || !authHeader.startsWith('Bearer ')) {
           return HttpResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
       }
       return HttpResponse.json({ url: 'https://mock-billing-portal.test/session=test' }, { status: 200 });
   }),

   http.post(`${API_BASE_URL}/api-subscriptions/:id/cancel`, async ({ request, params }) => {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return HttpResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
        }
        const { id } = params;
        console.log(`Mock cancelling subscription: ${id}`);
        mockCurrentSubscription = null;
        return HttpResponse.json(null, { status: 200 });
   }),

  // --- AI Chat endpoints ---
  http.get(`${API_BASE_URL}/ai-providers`, () => {
    console.log(`[MSW Global] Handling GET ${API_BASE_URL}/ai-providers`);
    // Revert: Return payload directly, ApiClient adds the 'data' wrapper
    return HttpResponse.json({ providers: [{ id: 'p-global', name: 'Global Provider' }] }, { status: 200 }); 
  }),

  http.get(`${API_BASE_URL}/system-prompts`, () => {
    console.log(`[MSW Global] Handling GET ${API_BASE_URL}/system-prompts`);
    // Revert: Return payload directly, ApiClient adds the 'data' wrapper
    return HttpResponse.json({ prompts: [{ id: 's-global', name: 'Global Prompt' }] }, { status: 200 });
  }),

  http.post(`${API_BASE_URL}/chat`, async ({ request }) => {
    console.log(`[MSW Global] Handling POST ${API_BASE_URL}/chat`);
    // Return a generic success response
    const body = await request.json() as any;
    return HttpResponse.json({ 
        id: 'm-global', 
        chat_id: body.chatId || 'new-chat-global', 
        role: 'assistant', 
        content: 'Global mock response', 
        created_at: new Date().toISOString()
    }, { status: 200 });
  }),

  http.get(`${API_BASE_URL}/chat-history`, ({ request }) => {
    console.log(`[MSW Global] Handling GET ${API_BASE_URL}/chat-history`);
    // Check auth - history requires login
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    }
    // Return mock chat list
    const mockHistory: Chat[] = [
      { id: 'chat1', user_id: 'test-user-id', title: 'Chat 1', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'chat2', user_id: 'test-user-id', title: 'Chat 2', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ];
    return HttpResponse.json(mockHistory, { status: 200 });
  }),

  http.get(`${API_BASE_URL}/chat-details/:chatId`, ({ request, params }) => {
    const { chatId } = params;
    console.log(`[MSW Global] Handling GET ${API_BASE_URL}/chat-details/${chatId}`);
    // Check auth - details requires login
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    }
    // Return mock messages for a specific chat ID
    const mockMessages: ChatMessage[] = [
      { id: 'msg1', chat_id: String(chatId), user_id: 'test-user-id', role: 'user', content: 'Hello from chat ' + chatId, created_at: new Date().toISOString(), ai_provider_id: null, system_prompt_id: null, token_usage: null },
      { id: 'msg2', chat_id: String(chatId), user_id: null, role: 'assistant', content: 'Hi there! This is chat ' + chatId, created_at: new Date().toISOString(), ai_provider_id: 'p-global', system_prompt_id: 's-global', token_usage: null },
    ];
    return HttpResponse.json(mockMessages, { status: 200 });
  }),

  // --- Notifications endpoint ---
  http.get(`${API_BASE_URL}/notifications`, ({ request }) => {
    // Check auth - notifications requires login
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return HttpResponse.json({ error: { message: 'Unauthorized' } }, { status: 401 });
    }
    // Return empty array for now
    return HttpResponse.json([], { status: 200 });
  }),

]; 