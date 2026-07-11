import { NextResponse } from "next/server";
import { callOpenAI } from "@/lib/ai";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json();
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 未配置" }, { status: 500 });

  let result = await callOpenAI("识别招聘邮件类型，输出 emailType、emailSummary、nextAction", { emailText: body.emailText });
  if (!result) {
    const text = String(body.emailText || "").toLowerCase();
    const emailType = /interview|面试/.test(text) ? "interview" : /assessment|测评|test/.test(text) ? "assessment" : /reject|遗憾|不合适/.test(text) ? "rejected" : "update";
    result = { mode: "demo", emailType, emailSummary: "已根据关键词粗略识别邮件类型。", nextAction: emailType === "interview" ? "确认可面试时间并回复 HR。" : "更新投递状态。" };
  }

  const { data, error } = await supabase.from("email_events").insert({
    customer_id: body.customerId,
    email_text: body.emailText || "",
    email_type: result.emailType || "update",
    email_summary: result.emailSummary || "",
    next_action: result.nextAction || ""
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id, emailType: data.email_type, emailSummary: data.email_summary, nextAction: data.next_action, createdAt: data.created_at });
}
