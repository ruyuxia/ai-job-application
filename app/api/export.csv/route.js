import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request) {
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  const jobIds = (url.searchParams.get("jobIds") || "").split(",").map((item) => item.trim()).filter(Boolean);
  const supabase = getSupabaseAdmin();
  let query = supabase ? supabase.from("jobs").select("*").eq("customer_id", customerId).order("created_at", { ascending: false }) : null;
  if (query && jobIds.length) query = query.in("id", jobIds);
  const { data: jobs = [] } = query ? await query : { data: [] };
  const header = ["公司", "岗位", "地点", "匹配度", "验证状态", "进度", "来源", "官方链接", "下一步", "面试经验"];
  const rows = jobs.map((job) => [job.company, job.title, job.location, job.fit_score, job.verification_status, job.status, job.source_url, job.official_url, job.next_action, job.analysis?.interviewNotes || ""]);
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  return new Response(`\ufeff${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=applications.csv"
    }
  });
}
