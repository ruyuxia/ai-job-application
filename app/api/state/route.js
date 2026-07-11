import { NextResponse } from "next/server";
import { capabilities, getSupabaseAdmin } from "@/lib/supabase";
import { fromJobRow } from "@/lib/serializers";

export const runtime = "nodejs";

export async function GET(request) {
  const customerId = new URL(request.url).searchParams.get("customerId");
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ profile: null, jobs: [], emailEvents: [], capabilities: capabilities() });

  const [{ data: profile }, { data: jobs }, { data: emailEvents }] = await Promise.all([
    supabase.from("profiles").select("*").eq("customer_id", customerId).maybeSingle(),
    supabase.from("jobs").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }),
    supabase.from("email_events").select("*").eq("customer_id", customerId).order("created_at", { ascending: false })
  ]);

  return NextResponse.json({
    profile: profile ? { resumeText: profile.resume_text || "", preferences: profile.preferences || {} } : { resumeText: "", preferences: {} },
    jobs: (jobs || []).map(fromJobRow),
    emailEvents: emailEvents || [],
    capabilities: capabilities()
  });
}
