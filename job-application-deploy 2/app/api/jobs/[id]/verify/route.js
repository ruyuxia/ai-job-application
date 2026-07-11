import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyJobOfficially } from "@/lib/verify";
import { fromJobRow } from "@/lib/serializers";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase 未配置" }, { status: 500 });

  const { data: row, error } = await supabase.from("jobs").select("*").eq("id", params.id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  const job = fromJobRow(row);
  const verification = await verifyJobOfficially(job);

  const { data, error: updateError } = await supabase.from("jobs").update({
    official_verification: verification,
    verification_status: verification.verificationStatus,
    official_url: verification.officialUrl || row.official_url,
    status: verification.verificationStatus === "verified" ? "ready_for_review" : "blocked",
    next_action: verification.verificationActions?.[0] || ""
  }).eq("id", params.id).select("*").single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json(fromJobRow(data));
}
