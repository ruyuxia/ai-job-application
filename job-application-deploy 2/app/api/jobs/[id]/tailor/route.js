import { NextResponse } from "next/server";
import { callOpenAI, demoAnalysis } from "@/lib/ai";
import { getSupabaseAdmin } from "@/lib/supabase";
import { preferencesToText } from "@/lib/text";
import { fromJobRow } from "@/lib/serializers";

export const runtime = "nodejs";

const BASIC_LIMIT = 10;

function hasTailoredResume(row) {
  return Boolean(row?.analysis?.tailoredResume || row?.analysis?.resumeDraft);
}

export async function POST(request, { params }) {
  const body = await request.json();
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 未配置" }, { status: 500 });

  const [{ data: jobRow, error }, { data: profile }, { data: allJobs = [] }] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", params.id).single(),
    supabase.from("profiles").select("*").eq("customer_id", body.customerId).maybeSingle(),
    supabase.from("jobs").select("id, analysis").eq("customer_id", body.customerId)
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const plan = profile?.preferences?.plan || "basic";
  const used = allJobs.filter((row) => row.id !== params.id && hasTailoredResume(row)).length;
  if (plan !== "pro" && !hasTailoredResume(jobRow) && used >= BASIC_LIMIT) {
    return NextResponse.json({ error: `初级用户最多定制 ${BASIC_LIMIT} 份简历。请升级高级用户或删除旧定制。` }, { status: 403 });
  }

  const job = fromJobRow(jobRow);
  const payload = { resumeText: profile?.resume_text || "", preferences: preferencesToText(profile?.preferences || {}), job };
  let result = await callOpenAI("根据用户原始简历和岗位 JD，生成一份针对该岗位的定制简历。必须保持经历真实，不编造公司、职位、时间、学历、证书或成果。输出 fitScore、matchSummary、strengths、gaps、tailoredResume、resumeDraft、coverNote、nextAction。tailoredResume 要像可直接复制使用的简历正文。", payload);
  if (result) result.mode = "ai";
  if (!result) result = { ...demoAnalysis(payload), tailoredResume: demoAnalysis(payload).resumeDraft };

  const mergedAnalysis = {
    ...(jobRow.analysis || {}),
    ...result,
    tailoredResume: result.tailoredResume || result.resumeDraft || "",
    tailoredAt: new Date().toISOString(),
    quota: {
      plan,
      used: hasTailoredResume(jobRow) ? used + 1 : used + 1,
      limit: plan === "pro" ? null : BASIC_LIMIT
    }
  };

  const { data, error: updateError } = await supabase.from("jobs").update({
    analysis: mergedAnalysis,
    fit_score: result.fitScore || jobRow.fit_score || null,
    status: "tailoring",
    next_action: "检查定制简历，确认后进入投递。"
  }).eq("id", params.id).select("*").single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json(fromJobRow(data));
}
