import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import OpenAI from "npm:openai@4.28.0";
import { createClient } from "npm:@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Type definitions
interface ChatRequest {
  prompt: string;
  systemPromptName?: string;
  previousMessages?: Message[];
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Verify the user is authenticated
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: authError }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Parse request
    const { prompt, systemPromptName = "default", previousMessages = [] } = await req.json() as ChatRequest;

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Get the system prompt
    const { data: systemPromptData, error: systemPromptError } = await supabase
      .from("system_prompts")
      .select("content")
      .eq("name", systemPromptName)
      .eq("is_active", true)
      .single();

    if (systemPromptError) {
      console.error("Error fetching system prompt:", systemPromptError);
      // If we can't find the specified prompt, use a fallback
      systemPromptData = { content: "You are a helpful AI assistant. Answer questions concisely and accurately." };
    }

    // Prepare messages for OpenAI
    const messages: Message[] = [
      { role: "system", content: systemPromptData.content },
      ...previousMessages,
      { role: "user", content: prompt },
    ];

    // Call OpenAI API using gpt-3.5-turbo instead of gpt-4-turbo-preview
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
      max_tokens: 1000,
    });

    const response = completion.choices[0].message.content;

    // Store the interaction in user_events
    const { error: insertError } = await supabase
      .from("user_events")
      .insert({
        user_id: user.id,
        event_type: "chat",
        event_description: prompt.substring(0, 100) + (prompt.length > 100 ? "..." : ""),
        event_details: {
          prompt,
          systemPromptName,
          response,
          timestamp: new Date().toISOString(),
        },
      });

    if (insertError) {
      console.error("Error storing chat history:", insertError);
    }

    // Return the response
    return new Response(
      JSON.stringify({
        response,
        messages: [
          ...messages,
          { role: "assistant", content: response },
        ],
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(
      JSON.stringify({ error: "Internal Server Error", details: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});