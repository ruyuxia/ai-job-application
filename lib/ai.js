import { scoreMatch } from "./text";

const TEXT_SYSTEM = "你是谨慎的 AI 求职投递助手。只基于用户简历、JD 和截图文字分析，不编造经历。招聘平台岗位不能直接视为已验证。只输出 JSON。";

function isNetworkTimeout(error) {
  return /timeout|UND_ERR_CONNECT_TIMEOUT|fetch failed|ConnectTimeout/i.test(String(error?.message || error?.cause?.message || ""));
}

function cleanJsonText(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

function parseJson(text, label) {
  const cleaned = cleanJsonText(text);
  try {
    return cleaned ? JSON.parse(cleaned) : null;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error(`${label}返回内容不是可解析的 JSON`);
  }
}

async function retryingFetchJson(url, options, label) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(90000)
      });
      const raw = await response.text();
      if (!response.ok) throw new Error(`${label}失败：${raw}`);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      lastError = error;
      if (!isNetworkTimeout(error) || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 1600));
    }
  }
  if (isNetworkTimeout(lastError)) throw new Error(`${label}连接超时。请稍后重试，或检查模型服务网络/额度。`);
  throw lastError;
}

async function openAIResponsesJsonRequest(body, label) {
  const data = await retryingFetchJson("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  }, label);
  const text = data.output_text || data.output?.[0]?.content?.[0]?.text;
  return parseJson(text, label);
}

function providerBaseUrl(provider) {
  if (provider === "deepseek") return process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
  return process.env.AI_BASE_URL || "https://api.openai.com/v1";
}

function providerApiKey(provider) {
  if (provider === "deepseek") return process.env.DEEPSEEK_API_KEY;
  return process.env.OPENAI_API_KEY;
}

function providerModel(provider) {
  if (provider === "deepseek") return process.env.DEEPSEEK_MODEL || "deepseek-chat";
  return process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

async function chatCompatibleJsonRequest({ provider, messages, label }) {
  const apiKey = providerApiKey(provider);
  if (!apiKey) return null;
  const baseUrl = providerBaseUrl(provider).replace(/\/$/, "");
  const data = await retryingFetchJson(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: providerModel(provider),
      messages,
      temperature: 0.2,
      response_format: { type: "json_object" }
    })
  }, label);
  return parseJson(data.choices?.[0]?.message?.content, label);
}

export async function callOpenAI(task, payload) {
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
  if (provider === "deepseek") {
    return chatCompatibleJsonRequest({
      provider,
      label: "DeepSeek 调用",
      messages: [
        { role: "system", content: TEXT_SYSTEM },
        { role: "user", content: JSON.stringify({ task, payload }) }
      ]
    });
  }

  if (!process.env.OPENAI_API_KEY) return null;
  return openAIResponsesJsonRequest({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: [
      { role: "system", content: TEXT_SYSTEM },
      { role: "user", content: JSON.stringify({ task, payload }) }
    ],
    text: { format: { type: "json_object" } }
  }, "OpenAI 调用");
}

async function filesToDataUrls(files) {
  return Promise.all(files.map(async (file) => {
    const buffer = Buffer.from(await file.arrayBuffer());
    return `data:${file.type};base64,${buffer.toString("base64")}`;
  }));
}

function screenshotPrompt() {
  return [
    "你是谨慎的岗位截图 OCR 与信息抽取助手。",
    "用户会上传一张或多张手机截图，截图可能属于同一个岗位，也可能是多个岗位列表/多个岗位详情。",
    "请先逐图读取可见文字，再按岗位拆分成 jobs 数组。只基于截图可见内容，不要猜测，不要补全不存在的信息。",
    "如果一张图里有多个岗位卡片，请尽量拆成多个岗位；如果是同一个岗位的多张详情图，请合并成一个岗位。",
    "company 必须是招聘公司或发布方名称，不要把 BOSS/猎聘/智联等平台名当公司名。",
    "title 必须是岗位名称，不要把页面标题、按钮文字或广告语当岗位。",
    "jdText 要尽量保留岗位职责、任职要求、经验/学历/语言要求、薪资、地点、工作方式、投递说明。",
    "看不清的字段留空，并在 nextAction 里提示用户补充更清晰截图或粘贴 JD。",
    "只输出 JSON，格式为：{\"jobs\":[{\"company\":\"\",\"title\":\"\",\"location\":\"\",\"salary\":\"\",\"language\":\"\",\"sourcePlatform\":\"\",\"jdText\":\"\",\"screenshotText\":\"\",\"extractionNote\":\"\",\"nextAction\":\"\"}]}"
  ].join("\n");
}

async function openAICompatibleVisionRequest(files) {
  const apiKey = process.env.VISION_API_KEY;
  if (!apiKey) throw new Error("需要配置 VISION_API_KEY，截图识别依赖视觉模型。");
  const baseUrl = (process.env.VISION_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/$/, "");
  const model = process.env.VISION_MODEL || "Qwen/Qwen2.5-VL-72B-Instruct";
  const imageUrls = await filesToDataUrls(files);
  const data = await retryingFetchJson(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: screenshotPrompt() },
          ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } }))
        ]
      }],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  }, "视觉模型截图识别");
  return parseJson(data.choices?.[0]?.message?.content, "视觉模型截图识别");
}

async function openAIVisionRequest(files) {
  if (!process.env.OPENAI_API_KEY) throw new Error("需要配置 OPENAI_API_KEY，截图识别依赖视觉模型。");
  const imageUrls = await filesToDataUrls(files);
  return openAIResponsesJsonRequest({
    model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: screenshotPrompt() },
        ...imageUrls.map((image_url) => ({ type: "input_image", image_url, detail: "high" }))
      ]
    }],
    text: { format: { type: "json_object" } }
  }, "OpenAI 截图识别");
}

export async function callOpenAIForJobScreenshots(files) {
  const provider = (process.env.VISION_PROVIDER || (process.env.VISION_API_KEY ? "openai-compatible" : "openai")).toLowerCase();
  if (provider === "openai") return openAIVisionRequest(files);
  return openAICompatibleVisionRequest(files);
}

export function demoAnalysis({ resumeText, job }) {
  const match = scoreMatch(resumeText, job.jdText);
  return {
    mode: "demo",
    fitScore: match.score,
    verificationStatus: "unverified",
    verificationNote: "演示模式不会自动确认岗位真实性，请运行官方验证。",
    verificationActions: ["点击“验证”按钮搜索公司官方渠道。", "找到官网/官方公众号/公司域名 HR 邮箱后再投递。"],
    recommendedChannel: "manual_verification_required",
    matchSummary: `演示模式粗略匹配：有 ${match.matchedKeywords.length} 个关键词重合。`,
    strengths: match.matchedKeywords.map((keyword) => `简历中已有 ${keyword} 相关表达。`),
    gaps: match.missingKeywords.map((keyword) => `JD 提到 ${keyword}，如真实具备可补充。`).slice(0, 5),
    resumeDraft: "这是演示模式建议。接入 AI 后会生成更完整的定制简历。",
    coverNote: `您好，我对贵司 ${job.title || "该岗位"} 很感兴趣，期待进一步沟通。`
  };
}
