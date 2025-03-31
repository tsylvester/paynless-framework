import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  createSupabaseClient, 
  getUserId 
} from "../_shared/supabase-client.ts";
import { 
  corsHeaders, 
  handleCorsPreflightRequest, 
  createErrorResponse, 
  createSuccessResponse 
} from "../_shared/cors-headers.ts";
import OpenAI from "npm:openai@4.28.0";

// Rate limiting configuration
const RATE_LIMITS = {
  FREE: {
    requests: 100,
    window: 24 * 60 * 60, // 24 hours in seconds
  },
  PREMIUM: {
    requests: 1000,
    window: 24 * 60 * 60,
  },
};

// Interface for AI provider handlers
interface AIProvider {
  generateText(model: any, messages: any[], config: any): Promise<any>;
}

// OpenAI provider implementation
class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  
  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }
  
  async generateText(model: any, messages: any[], config: any): Promise<any> {
    const completion = await this.client.chat.completions.create({
      model: model.model_id,
      messages,
      ...config,
    });
    
    return {
      content: completion.choices[0]?.message?.content || "",
      usage: {
        promptTokens: completion.usage?.prompt_tokens || 0,
        completionTokens: completion.usage?.completion_tokens || 0,
        totalTokens: completion.usage?.total_tokens || 0,
      },
    };
  }
}

// Anthropic provider implementation (example)
class AnthropicProvider implements AIProvider {
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  
  async generateText(model: any, messages: any[], config: any): Promise<any> {
    // Implementation for Anthropic's API would go here
    throw new Error("Anthropic provider not implemented yet");
  }
}

// Factory to create AI provider instances
class AIProviderFactory {
  static createProvider(type: string, config: any): AIProvider {
    switch (type.toLowerCase()) {
      case 'openai':
        const openaiKey = Deno.env.get("OPENAI_API_KEY");
        if (!openaiKey) throw new Error("OpenAI API key not configured");
        return new OpenAIProvider(openaiKey);
        
      case 'anthropic':
        const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
        if (!anthropicKey) throw new Error("Anthropic API key not configured");
        return new AnthropicProvider(anthropicKey);
        
      default:
        throw new Error(`Unsupported AI provider type: ${type}`);
    }
  }
}

// Check rate limit for a user
async function checkRateLimit(
  supabase: any,
  userId: string,
  subscriptionStatus: string = 'free'
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const limits = RATE_LIMITS[subscriptionStatus.toUpperCase()] || RATE_LIMITS.FREE;
  const windowStart = now - limits.window;
  
  // Get usage count for the current window
  const { count } = await supabase
    .from('ai_usage')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .gte('created_at', new Date(windowStart * 1000).toISOString());
  
  return (count || 0) < limits.requests;
}

// Record AI usage
async function recordUsage(
  supabase: any,
  userId: string,
  modelId: string,
  tokens: number
): Promise<void> {
  await supabase
    .from('ai_usage')
    .insert([
      {
        user_id: userId,
        model_id: modelId,
        tokens,
        created_at: new Date().toISOString(),
      },
    ]);
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflightRequest(req);
  if (corsResponse) return corsResponse;

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/ai/, "");
    const supabase = createSupabaseClient(req);
    
    try {
      const userId = await getUserId(req);
      
      // Get user's subscription status
      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();
      
      const subscriptionStatus = subscription?.status || 'free';
      
      // Check rate limit
      const withinLimit = await checkRateLimit(supabase, userId, subscriptionStatus);
      if (!withinLimit) {
        return createErrorResponse("Rate limit exceeded", 429);
      }
      
      // Parse request body if it exists
      let requestData = {};
      if (req.method !== "GET" && req.headers.get("content-type")?.includes("application/json")) {
        requestData = await req.json();
      }
      
      // Handle different routes
      
      // Get available models
      if (path === "/models" && req.method === "GET") {
        const { data: models, error: modelsError } = await supabase
          .from("ai_models")
          .select(`
            *,
            provider:provider_id (
              name,
              type,
              config
            )
          `)
          .eq("is_enabled", true)
          .order("name");
        
        if (modelsError) {
          return createErrorResponse(modelsError.message, 400);
        }
        
        return createSuccessResponse({ models });
      }
      
      // Get system prompts
      if (path === "/prompts" && req.method === "GET") {
        const category = url.searchParams.get("category");
        
        let query = supabase
          .from("system_prompts")
          .select("*")
          .eq("is_enabled", true);
        
        if (category) {
          query = query.eq("category", category);
        }
        
        const { data: prompts, error: promptsError } = await query.order("name");
        
        if (promptsError) {
          return createErrorResponse(promptsError.message, 400);
        }
        
        return createSuccessResponse({ prompts });
      }
      
      // Generate text
      if (path === "/generate" && req.method === "POST") {
        const { content, modelId, promptId } = requestData as any;
        
        if (!content || !modelId || !promptId) {
          return createErrorResponse("Missing required parameters", 400);
        }
        
        // Get model details with provider info
        const { data: modelData, error: modelError } = await supabase
          .from("ai_models")
          .select(`
            *,
            provider:provider_id (
              name,
              type,
              config
            )
          `)
          .eq("id", modelId)
          .single();
        
        if (modelError || !modelData) {
          return createErrorResponse("Model not found", 404);
        }
        
        // Get prompt details
        const { data: promptData, error: promptError } = await supabase
          .from("system_prompts")
          .select("*")
          .eq("id", promptId)
          .single();
        
        if (promptError || !promptData) {
          return createErrorResponse("Prompt not found", 404);
        }
        
        try {
          // Create provider instance based on type
          const provider = AIProviderFactory.createProvider(
            modelData.provider.type,
            modelData.provider.config
          );
          
          // Prepare messages
          const messages = [
            {
              role: "system",
              content: promptData.content,
            },
            {
              role: "user",
              content,
            },
          ];
          
          // Generate response using the provider
          const response = await provider.generateText(
            modelData,
            messages,
            modelData.config
          );
          
          // Record usage
          await recordUsage(
            supabase,
            userId,
            modelId,
            response.usage?.totalTokens || 0
          );
          
          return createSuccessResponse(response);
        } catch (error) {
          console.error("AI provider error:", error);
          return createErrorResponse(error.message);
        }
      }
      
      // Route not found
      else {
        return createErrorResponse("Not found", 404);
      }
    } catch (routeError) {
      // Specific handling for authentication errors
      if (routeError.message === "Unauthorized") {
        return createErrorResponse("Unauthorized", 401);
      }
      throw routeError; // Let the outer catch handle other errors
    }
  } catch (error) {
    console.error("Error handling request:", error);
    return createErrorResponse(error.message);
  }
});