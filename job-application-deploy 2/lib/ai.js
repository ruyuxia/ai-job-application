import { scoreMatch } from "./text";

function isNetworkTimeout(error) {
  return /timeout|UND_ERR_CONNECT_TIMEOUT|fetch failed|ConnectTimeout/i.test(String(error?.message || error?.cause?.message || ""));
}

async function openAIJsonRequest(body, label) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: AbortSignal.timeout(90000),
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`${label}失败：${await response.text()}`);
      const data = await response.json();
      const text = data.output_text || data.output?.[0]?.content?.[0]?.text;
      return text ? JSON.parse(text) : null;
    } catch (error) {
      lastError = error;
      if (!isNetworkTimeout(error) || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 1600));
    }
  }
  if (isNetworkTimeout(lastError)) {
    throw new Error(`${label}连接 OpenAI 超时。图片识别本身不难，是当前电脑/网络连 api.openai.com 不稳定；请稍后重试，或切换网络/代理。`);
  }
  throw lastError;
}

export async function callOpenAI(task, payload) {
  if (!process.env.OPENAI_API_KEY) return null;
  return openAIJsonRequest({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: [
      { role: "system", content: "你是谨慎的 AI 求职投递助手。只基于用户简历、JD 和截图文字分析，不编造经历。招聘平台岗位不能直接视为已验证。输出 JSON。" },
      { role: "user", content: JSON.stringify({ task, payload }) }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "job_application_result",
        schema: {
          type: "object",
          additionalProperties: true,
          properties: {
            fitScore: { type: "number" },
            verificationStatus: { type: "string" },
            verificationNote: { type: "string" },
            verificationActions: { type: "array", items: { type: "string" } },
            recommendedChannel: { type: "string" },
            matchSummary: { type: "string" },
            strengths: { type: "array", items: { type: "string" } },
            gaps: { type: "array", items: { type: "string" } },
            resumeDraft: { type: "string" },
            coverNote: { type: "string" },
            emailType: { type: "string" },
            emailSummary: { type: "string" },
            nextAction: { type: "string" },
            company: { type: "string" },
            title: { type: "string" },
            location: { type: "string" },
            language: { type: "string" },
            officialUrl: { type: "string" },
            jdText: { type: "string" },
            extractionNote: { type: "string" }
          }
        }
      }
    }
  }, "OpenAI 调用");
}

export async function callOpenAIForJobScreenshots(files) {
  if (!process.env.OPENAI_API_KEY) throw new Error("需要先配置 OPENAI_API_KEY，截图识别依赖 OpenAI 视觉模型。");
  const imageParts = await Promise.all(files.map(async (file) => {
    const buffer = Buffer.from(await file.arrayBuffer());
    return {
      type: "input_image",
      image_url: `data:${file.type};base64,${buffer.toString("base64")}`,
      detail: "high"
    };
  }));
  return openAIJsonRequest({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: [{
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            "你是谨慎的岗位截图 OCR 与信息抽取助手。",
            "用户会上传一张或多张手机截图，截图可能属于同一个岗位，也可能是多个岗位列表/多个岗位详情。",
            "请先逐图读取可见文字，再按岗位拆分成 jobs 数组。只基于截图可见内容，不要猜测，不要补全不存在的信息。",
            "如果一张图里有多个岗位卡片，请尽量拆成多个岗位；如果是同一个岗位的多张详情图，请合并成一个岗位。",
            "company 必须是招聘公司或发布方名称，不要把 BOSS/猎聘/智联等平台名当公司名。",
            "title 必须是岗位名称，不要把页面标题、按钮文字或广告语当岗位。",
            "jdText 要尽量保留岗位职责、任职要求、经验/学历/语言要求、薪资、地点、工作方式、投递说明。",
            "看不清的字段留空，并在 nextAction 里提示用户补充更清晰截图或粘贴 JD。"
          ].join("\n")
        },
        ...imageParts
      ]
    }],
    text: {
      format: {
        type: "json_schema",
        name: "job_screenshot_extraction",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            jobs: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  company: { type: "string" },
                  title: { type: "string" },
                  location: { type: "string" },
                  salary: { type: "string" },
                  language: { type: "string" },
                  sourcePlatform: { type: "string" },
                  jdText: { type: "string" },
                  screenshotText: { type: "string" },
                  extractionNote: { type: "string" },
                  nextAction: { type: "string" }
                },
                required: ["company", "title", "location", "salary", "language", "sourcePlatform", "jdText", "screenshotText", "extractionNote", "nextAction"]
              }
            }
          },
          required: ["jobs"]
        }
      }
    }
  }, "OpenAI 截图识别");
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
    resumeDraft: "这是演示模式建议。接入 OpenAI 后会生成更完整的定制简历。",
    coverNote: `您好，我对贵司 ${job.title || "该岗位"} 很感兴趣，期待进一步沟通。`
  };
}
