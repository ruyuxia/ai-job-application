import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { fromJobRow } from "@/lib/serializers";

export const runtime = "nodejs";

const allowedStatuses = new Set(["company", "job", "applied", "hr_reply", "first_interview", "second_interview", "final_interview", "offer", "rejected", "blocked"]);

export async function PATCH(request, { params }) {
  const body = await request.json();
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 未配置" }, { status: 500 });

  const { data: row, error } = await supabase.from("jobs").select("*").eq("id", params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const status = allowedStatuses.has(body.status) ? body.status : row.status;
  const analysis = {
    ...(row.analysis || {}),
    interviewNotes: body.interviewNotes ?? row.analysis?.interviewNotes ?? "",
    progressUpdatedAt: new Date().toISOString()
  };

  const { data, error: updateError } = await supabase.from("jobs").update({
    status,
    analysis,
    next_action: body.nextAction ?? row.next_action ?? ""
  }).eq("id", params.id).select("*").single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json(fromJobRow(data));
}
