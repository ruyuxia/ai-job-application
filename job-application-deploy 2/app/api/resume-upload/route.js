import { NextResponse } from "next/server";
import { extractResumeText } from "@/lib/text";

export const runtime = "nodejs";

export async function POST(request) {
  const formData = await request.formData();
  const file = formData.get("resume");
  if (!file) return NextResponse.json({ error: "没有收到简历文件" }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const text = extractResumeText(file.name || "resume", buffer);
  return NextResponse.json({
    filename: file.name,
    text,
    chars: text.length,
    note: file.name?.toLowerCase().endsWith(".pdf") ? "PDF 已尝试提取文本。若内容不完整，请直接复制粘贴简历文字。" : "简历文本已提取。"
  });
}
