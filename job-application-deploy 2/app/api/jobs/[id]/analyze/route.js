import { NextResponse } from "next/server";
import { callOpenAI, demoAnalysis } from "@/lib/ai";
import { getSupabaseAdmin } from "@/lib/supabase";
import { preferencesToText } from "@/lib/text";
import { fromJobRow } from "@/lib/serializers";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const body = await request.json();
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 未配置" }, { status: 500 });

  const [{ data: jobRow, error }, { data: profile }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", params.id).single(),
    supabase.from("profiles").select("*").eq("customer_id", body.customerId).maybeSingle()
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const job = fromJobRow(jobRow);
  const payload = { resumeText: profile?.resume_text || "", preferences: preferencesToText(profile?.preferences || {}), job };
  let analysis = await callOpenAI("分析岗位匹配、验证风险、生成简历修改建议和投递话术", payload);
  if (analysis) analysis.mode = "ai";
  if (!analysis) analysis = demoAnalysis(payload);

  const { data, error: updateError } = await supabase.from("jobs").update({
    analysis,
    fit_score: analysis.fitScore || null,
    verification_status: analysis.verificationStatus || jobRow.verification_status,
    status: analysis.verificationStatus === "verified" ? "ready_for_review" : "blocked"
  }).eq("id", params.id).select("*").single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json(fromJobRow(data));
}
