import { NextResponse } from "next/server";
import { callOpenAIForJobScreenshots } from "@/lib/ai";

export const runtime = "nodejs";

const MAX_FILES = 6;
const MAX_TOTAL_BYTES = 14 * 1024 * 1024;

function normalizeJob(extracted = {}) {
  const jdText = [
    extracted.salary ? `薪资：${extracted.salary}` : "",
    extracted.jdText || "",
    extracted.screenshotText ? `截图识别原文：\n${extracted.screenshotText}` : ""
  ].filter(Boolean).join("\n\n");
  return {
    company: extracted.company || "",
    title: extracted.title || "",
    location: extracted.location || "",
    language: extracted.language || "中文",
    sourceUrl: extracted.sourcePlatform ? `截图上传：${extracted.sourcePlatform}` : "截图上传",
    officialUrl: "",
    jdText,
    verificationStatus: "unverified",
    nextAction: extracted.nextAction || "保存岗位后点击“验证”，搜索公司官方渠道确认真实性。",
    extractionNote: extracted.extractionNote || "已从岗位截图识别信息。请保存前人工扫一眼。"
  };
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("screenshots").filter((file) => file?.size);
    if (!files.length) return NextResponse.json({ error: "请先上传岗位截图" }, { status: 400 });
    if (files.length > MAX_FILES) return NextResponse.json({ error: `一次最多上传 ${MAX_FILES} 张截图` }, { status: 400 });
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_TOTAL_BYTES) return NextResponse.json({ error: "图片太大了，请先裁剪或减少截图数量" }, { status: 400 });
    const invalid = files.find((file) => !/^image\/(png|jpe?g|webp)$/i.test(file.type));
    if (invalid) return NextResponse.json({ error: "截图只支持 png、jpg、jpeg、webp" }, { status: 400 });

    const extracted = await callOpenAIForJobScreenshots(files);
    const jobs = (extracted?.jobs || []).map(normalizeJob).filter((job) => job.title || job.company || job.jdText);
    if (!jobs.length) return NextResponse.json({ error: "截图里没有识别到完整岗位，请换更清晰截图或粘贴 JD" }, { status: 422 });
    return NextResponse.json({ jobs });
  } catch (error) {
    return NextResponse.json({
      error: `岗位截图识别失败：${error.message || "未知错误"}`
    }, { status: 500 });
  }
}
