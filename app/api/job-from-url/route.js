import { NextResponse } from "next/server";
import { callOpenAI } from "@/lib/ai";
import { fetchJobFromUrl } from "@/lib/verify";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body.sourceUrl) return NextResponse.json({ error: "请先粘贴岗位链接" }, { status: 400 });
    const fallback = await fetchJobFromUrl(body.sourceUrl);
    const aiResult = await callOpenAI("从岗位链接线索、搜索摘要或网页正文中提取岗位信息。招聘平台原网页可能无法抓取；不要编造网页中没有的信息。输出 company、title、location、language、jdText、officialUrl、extractionNote、verificationStatus、verificationNote、recommendedChannel、nextAction。无法官方确认时 verificationStatus 必须是 unverified。", {
      sourceUrl: body.sourceUrl,
      pageText: fallback.jdText,
      existingInference: fallback
    });
    return NextResponse.json({ ...fallback, ...(aiResult || {}), sourceUrl: body.sourceUrl });
  } catch (error) {
    return NextResponse.json({
      error: `岗位链接研究失败：${error.message || "未知错误"}。如果这是招聘平台登录页或动态页面，请展开手动修改区，粘贴 JD。`
    }, { status: 500 });
  }
}
