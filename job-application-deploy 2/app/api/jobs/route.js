import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fromJobRow } from "@/lib/serializers";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json();
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 未配置" }, { status: 500 });

  const payload = {
    customer_id: body.customerId,
    company: body.company || "未命名公司",
    title: body.title || "未命名岗位",
    location: body.location || "",
    language: body.language || "中文",
    source_url: body.sourceUrl || "",
    official_url: body.officialUrl || "",
    jd_text: body.jdText || "",
    status: body.status || (body.verificationStatus === "likely" ? "blocked" : "job"),
    verification_status: body.verificationStatus || "unverified",
    official_verification: body.officialVerification || null,
    next_action: body.nextAction || ""
  };

  const { data, error } = await supabase.from("jobs").insert(payload).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(fromJobRow(data));
}
