// Modified edge function with improved error handling and RLS bypass
// Path: supabase/functions/chat/index.ts

// @ts-expect-error Deno used by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-expect-error Deno used by Supabase
import OpenAI from "npm:openai@4.28.0";
// @ts-expect-error Deno used by Supabase
import { createClient } from "npm:@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// @ts-expect-error Deno used by Supabase
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
// @ts-expect-error Deno used by Supabase
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// @ts-expect-error Deno used by Supabase
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";

// Initialize Supabase client with service role key to bypass RLS
const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    // Explicitly set the global settings to use service role permissions
    global: {
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    }
  }
);

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Type definitions
interface ChatRequest {
  prompt: string;
  systemPromptName?: string;
  previousMessages?: Message[];
  conversationId?: string | null;
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

// Check available models and select the best one
async function getBestAvailableModel(openai) {
  try {
    const { data } = await openai.models.list();
    
    // Define model preference order
    const preferredModels = [
      "gpt-4-turbo",
      "gpt-4-1106-preview",
      "gpt-4",
      "gpt-3.5-turbo-1106",
      "gpt-3.5-turbo"
    ];
    
    // Find the best available model from our preference list
    const availableModels = data.map(model => model.id);
    const bestModel = preferredModels.find(model => availableModels.includes(model));
    
    return bestModel || "gpt-3.5-turbo"; // Default fallback
  } catch (error) {
    console.error("Error fetching models:", error);
    return "gpt-3.5-turbo"; // Default fallback if API call fails
  }
}

serve(async (req: Request) => {
  console.log("Request received");
  
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS request");
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Get the authorization header for user authentication
    const authHeader = req.headers.get("Authorization");
    console.log("Auth header present:", !!authHeader);
    
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Verify the user is authenticated (we still need to know who the user is)
    const token = authHeader.replace("Bearer ", "");
    console.log("Attempting to authenticate user with token");
    
    const authResponse = await supabase.auth.getUser(token);
    console.log("Auth response received:", !!authResponse);
    
    const user = authResponse.data?.user;
    const authError = authResponse.error;
    
    console.log("User authenticated:", !!user);
    console.log("Auth error:", authError ? JSON.stringify(authError) : "none");

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", details: authError }),
        {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log("User ID:", user.id);
    
    // Parse request
    const requestData = await req.json();
    console.log("Request body parsed");
    
    const { 
      prompt, 
      systemPromptName = "default", 
      previousMessages = [],
      conversationId = null 
    } = requestData as ChatRequest;
    
    console.log("Prompt:", prompt ? prompt.substring(0, 30) + "..." : "missing");
    console.log("System prompt name:", systemPromptName);
    console.log("Previous messages count:", previousMessages.length);
    console.log("Conversation ID:", conversationId);

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
    console.log("Fetching system prompt:", systemPromptName);
    
    let systemPromptData;
    // Use admin client for this query to bypass RLS
    const systemPromptResponse = await supabase
      .from("system_prompts")
      .select("content")
      .eq("name", systemPromptName)
      .eq("is_active", true)
      .single();
    
    const data = systemPromptResponse.data;
    const systemPromptError = systemPromptResponse.error;
    
    console.log("System prompt found:", !!data);
    console.log("System prompt error:", systemPromptError ? JSON.stringify(systemPromptError) : "none");

    if (systemPromptError) {
      console.error("Error fetching system prompt:", systemPromptError);
      // If we can't find the specified prompt, use a fallback
      systemPromptData = { content: "You are a helpful AI assistant. Answer questions concisely and accurately." };
      console.log("Using fallback system prompt");
    } else {
      systemPromptData = data;
      console.log("Using retrieved system prompt");
    }

    // Prepare messages for OpenAI
    const messages = [
      { role: "system", content: systemPromptData.content },
      ...previousMessages,
      { role: "user", content: prompt },
    ];
    console.log("Messages prepared for OpenAI");

    // Get the best available model
    console.log("Selecting best available model");
    const model = await getBestAvailableModel(openai);
    console.log("Selected model:", model);

    // Call OpenAI API with the selected model
    console.log("Calling OpenAI API");
    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages,
      max_tokens: 1000,
    });
    console.log("OpenAI API response received");

    const response = completion.choices[0].message.content;
    console.log("Response extracted from OpenAI response");

    // Create a complete response message array
    const allMessages = [
      ...messages,
      { role: "assistant", content: response }
    ];
    console.log("All messages prepared for storage");

    // Check if we have a conversation ID already
    if (conversationId) {
      console.log("Using existing conversation ID:", conversationId);
      
      // Try to find an existing conversation with this ID
      const { data: existingChat, error: findError } = await supabase
        .from("user_events")
        .select("event_id, event_details")
        .eq("event_id", conversationId)
        .maybeSingle();
      
      if (findError) {
        console.error("Error checking for existing conversation:", findError);
      }
      
      if (existingChat) {
        console.log("Found existing conversation, updating");
        
        // Update the existing conversation with new messages
        const updatedDetails = {
          ...existingChat.event_details,
          prompt, // Latest prompt
          response, // Latest response
          timestamp: new Date().toISOString(),
          messages: allMessages, // All messages including the new ones
          model: model,
          systemPromptName
        };
        
        // Update existing record instead of creating a new one
        const { error: updateError } = await supabase
          .from("user_events")
          .update({
            event_details: updatedDetails,
            event_description: prompt.substring(0, 100) + (prompt.length > 100 ? "..." : "")
          })
          .eq("event_id", conversationId);
        
        if (updateError) {
          console.error("Error updating existing conversation:", updateError);
        } else {
          console.log("Conversation updated successfully");
        }
      } else {
        console.log("Conversation ID provided but no existing conversation found, creating new");
        
        // Create a new record with the provided ID
        const insertData = {
          event_id: conversationId, // Use the provided conversation ID
          user_id: user.id,
          event_type: "chat",
          event_description: prompt.substring(0, 100) + (prompt.length > 100 ? "..." : ""),
          event_details: {
            prompt,
            systemPromptName,
            response,
            timestamp: new Date().toISOString(),
            messages: allMessages,
            model: model
          },
        };
        
        const { error: insertError } = await supabase
          .from("user_events")
          .insert(insertData);
        
        if (insertError) {
          console.error("Error creating new conversation with provided ID:", insertError);
        } else {
          console.log("New conversation created with provided ID");
        }
      }
    } else {
      // No conversation ID provided, create a new one
      console.log("No conversation ID provided, creating new conversation");
      
      const insertData = {
        user_id: user.id,
        event_type: "chat",
        event_description: prompt.substring(0, 100) + (prompt.length > 100 ? "..." : ""),
        event_details: {
          prompt,
          systemPromptName,
          response,
          timestamp: new Date().toISOString(),
          messages: allMessages,
          model: model
        },
      };
      
      const { data: insertData2, error: insertError } = await supabase
        .from("user_events")
        .insert(insertData)
        .select();
      
      if (insertError) {
        console.error("Error storing chat history:", insertError);
      } else {
        console.log("New conversation created successfully");
      }
    }

    // Always return the response to the client, even if storage fails
    return new Response(
      JSON.stringify({
        response,
        messages: allMessages,
        model: model,
      }),
      {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error) {
    console.error("Error processing request:", error);
    // Log the full error details
    console.error("Error stack:", error.stack);
    console.error("Error message:", error.message);
    
    return new Response(
      JSON.stringify({ error: "Internal Server Error", details: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});