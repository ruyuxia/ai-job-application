import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { extractKeywords, preferencesToText } from "@/lib/text";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json();
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 未配置" }, { status: 500 });

  const payload = {
    customer_id: body.customerId,
    resume_text: body.resumeText || "",
    preferences: body.preferences || {},
    parsed_profile: {
      resumeChars: (body.resumeText || "").length,
      keywords: extractKeywords(`${body.resumeText || ""}\n${preferencesToText(body.preferences || {})}`).slice(0, 12),
      updatedAt: new Date().toISOString()
    }
  };

  const { data, error } = await supabase.from("profiles").upsert(payload, { onConflict: "customer_id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ resumeText: data.resume_text, preferences: data.preferences, parsedProfile: data.parsed_profile });
}
