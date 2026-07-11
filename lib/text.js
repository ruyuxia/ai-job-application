import { inflateRawSync } from "node:zlib";

export function extractKeywords(text) {
  const source = String(text || "");
  const lower = source.toLowerCase();
  const terms = [
    "用户调研", "竞品分析", "需求分析", "产品规划", "产品设计", "原型设计", "需求文档", "项目管理",
    "跨团队协作", "数据分析", "数据看板", "增长分析", "A/B test", "SQL", "BI", "Tableau",
    "Power BI", "Excel", "Python", "prompt workflow", "大模型", "AI 产品", "客服机器人",
    "培训体系", "课程开发", "讲师培养", "保险销售", "银行保险", "高净值客户", "法税", "PPT",
    "英语", "普通话", "金融行业", "销售流程", "渠道培训", "团队管理", "客户经营"
  ];
  const found = terms.filter((term) => lower.includes(term.toLowerCase()));
  const english = lower.match(/\b(?:sql|python|excel|tableau|power\s*bi|figma|jira|notion|crm|saas|api|prompt|workflow|a\/b\s*test)\b/g) || [];
  return [...new Set([...found, ...english])].slice(0, 24);
}

export function preferencesToText(preferences = {}) {
  if (typeof preferences === "string") return preferences;
  return [
    `地点：${preferences.locations || ""}`,
    `企业类型：${(preferences.companyTypes || []).join("、")}`,
    `职位类型：${(preferences.roleTypes || []).join("、")}`,
    `薪资：${preferences.salary || ""}`,
    `语言：${preferences.languages || ""}`,
    `排除：${preferences.exclusions || ""}`,
    `企业分析：${preferences.allowCompanyResearch ? "允许" : "不启用"}`,
    `补充：${preferences.notes || ""}`
  ].filter((line) => !line.endsWith("：")).join("\n");
}

export function scoreMatch(resumeText, jdText) {
  const resumeKeywords = new Set(extractKeywords(resumeText));
  const jdKeywords = extractKeywords(jdText);
  const hits = jdKeywords.filter((word) => resumeKeywords.has(word));
  const score = jdKeywords.length ? Math.round((hits.length / jdKeywords.length) * 65 + 25) : 60;
  return {
    score: Math.max(35, Math.min(96, score)),
    matchedKeywords: hits.slice(0, 10),
    missingKeywords: jdKeywords.filter((word) => !resumeKeywords.has(word)).slice(0, 10)
  };
}

export function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function stripHtml(html) {
  return decodeHtml(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim());
}

function firstText(html, pattern) {
  const match = html.match(pattern);
  return match ? stripHtml(match[1]) : "";
}

function meta(html, name) {
  const match = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

export function inferJobFromHtml(sourceUrl, html) {
  const pageTitle = decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = meta(html, "description") || meta(html, "og:description");
  const liepinTitle = firstText(html, /<span[^>]+class=["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  const liepinSalary = firstText(html, /<span[^>]+class=["'][^"']*\bsalary\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
  const liepinIntro = firstText(html, /<dd[^>]+data-selector=["']job-intro-content["'][^>]*>([\s\S]*?)<\/dd>/i);
  const liepinCompany = firstText(html, /<a[^>]+href=["']https:\/\/www\.liepin\.com\/company\/[^"']+["'][^>]*>([\s\S]*?)<\/a>/i).replace(/^·\s*/, "");
  const liepinLocation = firstText(html, /<div[^>]+class=["']job-properties["'][^>]*>\s*<span>([\s\S]*?)<\/span>/i);
  const parts = pageTitle.split(/\s*[-_|｜·]\s*/).filter(Boolean);
  const text = stripHtml(html).slice(0, 12000);
  const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
  return {
    company: liepinCompany || (parts.length > 1 ? parts.at(-1) : host.split(".")[0]),
    title: liepinTitle || parts[0] || "待识别岗位",
    location: liepinLocation || text.match(/(上海|北京|深圳|广州|杭州|成都|南京|苏州|远程|Remote)/i)?.[0] || "",
    language: /english|英文|英语/i.test(text) ? "英文/中文" : "中文",
    sourceUrl,
    officialUrl: /career|careers|jobs|join|zhaopin|recruit/i.test(sourceUrl) ? sourceUrl : "",
    jdText: [liepinTitle, liepinSalary, description, liepinIntro || text].filter(Boolean).join("\n\n").slice(0, 10000),
    extractionNote: "已从岗位链接抓取页面内容并自动预填，请保存前人工扫一眼。"
  };
}

function zipEntries(buffer) {
  const entries = new Map();
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocdOffset = i; break; }
  }
  if (eocdOffset < 0) throw new Error("无法读取 docx 文件目录");
  let offset = buffer.readUInt32LE(eocdOffset + 16);
  const end = offset + buffer.readUInt32LE(eocdOffset + 12);
  while (offset < end && buffer.readUInt32LE(offset) === 0x02014b50) {
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const filename = buffer.slice(offset + 46, offset + 46 + filenameLength).toString("utf8");
    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    entries.set(filename, method === 8 ? inflateRawSync(compressed) : compressed);
    offset += 46 + filenameLength + extraLength + commentLength;
  }
  return entries;
}

export function extractResumeText(filename, buffer) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".csv")) return buffer.toString("utf8");
  if (lower.endsWith(".docx")) {
    const xml = zipEntries(buffer).get("word/document.xml");
    if (!xml) throw new Error("docx 中没有找到正文");
    return decodeHtml(xml.toString("utf8").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").trim());
  }
  if (lower.endsWith(".pdf")) {
    const raw = buffer.toString("latin1");
    const pieces = [...raw.matchAll(/\(([^()]{2,500})\)/g)].map((match) => match[1]);
    return pieces.join(" ").replace(/[^\x09\x0A\x0D\x20-\x7E\u4E00-\u9FFF]+/g, " ").trim() || "未能从 PDF 中提取到文本。若这是扫描件，请直接粘贴简历文字。";
  }
  throw new Error("暂时只支持 txt、docx 和文本型 pdf");
}
