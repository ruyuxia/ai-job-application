import { NextResponse } from "next/server";
import { callOpenAI } from "@/lib/ai";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const jdText = String(body.jdText || "").trim();
    if (!jdText) return NextResponse.json({ error: "请先粘贴岗位 JD 内容" }, { status: 400 });

    const result = await callOpenAI("从用户粘贴的岗位 JD 中提取岗位信息。只基于文本可见内容，不要编造。输出 company、title、location、language、jdText、extractionNote、nextAction。无法确认的字段留空。", {
      jdText
    });

    return NextResponse.json({
      company: result?.company || "",
      title: result?.title || "",
      location: result?.location || "",
      language: result?.language || "中文",
      sourceUrl: "手动粘贴 JD",
      officialUrl: "",
      jdText: result?.jdText || jdText,
      verificationStatus: "unverified",
      nextAction: result?.nextAction || "保存岗位后点击“验证”，搜索公司官方渠道确认真实性。",
      extractionNote: result?.extractionNote || "已从粘贴的 JD 中识别岗位信息。真实性仍需验证。"
    });
  } catch (error) {
    return NextResponse.json({
      error: `岗位文字识别失败：${error.message || "未知错误"}`
    }, { status: 500 });
  }
}
