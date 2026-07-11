import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fromJobRow } from "@/lib/serializers";

export const runtime = "nodejs";

function toPayload(customerId, job) {
  return {
    customer_id: customerId,
    company: job.company || "未命名公司",
    title: job.title || "未命名岗位",
    location: job.location || "",
    language: job.language || "中文",
    source_url: job.sourceUrl || "",
    official_url: job.officialUrl || "",
    jd_text: job.jdText || "",
    status: job.status || (job.verificationStatus === "likely" ? "blocked" : "job"),
    verification_status: job.verificationStatus || "unverified",
    official_verification: job.officialVerification || null,
    next_action: job.nextAction || ""
  };
}

export async function POST(request) {
  const body = await request.json();
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 未配置" }, { status: 500 });
  const jobs = Array.isArray(body.jobs) ? body.jobs : [];
  if (!body.customerId || !jobs.length) return NextResponse.json({ error: "请选择要保存的岗位" }, { status: 400 });

  const { data, error } = await supabase.from("jobs").insert(jobs.map((job) => toPayload(body.customerId, job))).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: (data || []).map(fromJobRow) });
}

export async function DELETE(request) {
  const body = await request.json();
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 未配置" }, { status: 500 });
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (!body.customerId || !ids.length) return NextResponse.json({ error: "请选择要删除的岗位" }, { status: 400 });

  const { error } = await supabase.from("jobs").delete().eq("customer_id", body.customerId).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deletedIds: ids });
}
