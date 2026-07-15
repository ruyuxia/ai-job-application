import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function capabilities() {
  const aiProvider = (process.env.AI_PROVIDER || "openai").toLowerCase();
  const visionProvider = (process.env.VISION_PROVIDER || (process.env.VISION_API_KEY ? "openai-compatible" : "openai")).toLowerCase();
  return {
    aiEnabled: aiProvider === "deepseek" ? Boolean(process.env.DEEPSEEK_API_KEY) : Boolean(process.env.OPENAI_API_KEY),
    visionEnabled: visionProvider === "openai" ? Boolean(process.env.OPENAI_API_KEY) : Boolean(process.env.VISION_API_KEY),
    aiProvider,
    visionProvider,
    searchEnabled: Boolean(process.env.TAVILY_API_KEY),
    supabaseEnabled: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  };
}
