import { extractKeywords, inferJobFromHtml } from "./text";

export function hostnameOf(value) {
  try { return new URL(value || "").hostname.replace(/^www\./, ""); } catch { return ""; }
}

export function isPlatformHost(hostname) {
  return /liepin|zhipin|boss|lagou|51job|zhaopin|linkedin|kanzhun|maimai|indeed|glassdoor/i.test(hostname || "");
}

function platformName(hostname) {
  if (/liepin/i.test(hostname)) return "猎聘";
  if (/zhipin|boss/i.test(hostname)) return "BOSS直聘";
  if (/51job/i.test(hostname)) return "前程无忧";
  if (/zhaopin/i.test(hostname)) return "智联招聘";
  if (/lagou/i.test(hostname)) return "拉勾";
  if (/linkedin/i.test(hostname)) return "LinkedIn";
  return hostname || "招聘平台";
}

function compactText(value, limit = 12000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function isWeakInference(job) {
  const host = hostnameOf(job.sourceUrl);
  const hostToken = host.split(".")[0]?.toLowerCase();
  const company = String(job.company || "").toLowerCase();
  return !job.title || job.title === "待识别岗位" || !job.company || company === hostToken || isPlatformHost(company);
}

function searchResultsToText(results = []) {
  return results
    .map((item, index) => [`结果 ${index + 1}: ${item.title}`, item.url, item.content].filter(Boolean).join("\n"))
    .join("\n\n");
}

function inferJobFromSearchResults(sourceUrl, results = []) {
  const combined = searchResultsToText(results);
  const inferred = inferJobFromHtml(sourceUrl, combined);
  const firstTitle = results[0]?.title || "";
  const titleParts = firstTitle.split(/\s*[-_|｜·]\s*/).filter(Boolean);
  return {
    ...inferred,
    title: inferred.title === "待识别岗位" ? (titleParts[0] || inferred.title) : inferred.title,
    company: inferred.company || titleParts.at(-1) || platformName(hostnameOf(sourceUrl)),
    jdText: compactText(combined, 10000)
  };
}

async function fetchHtml(url) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Referer: "https://www.google.com/"
      }
    });
    if (!response.ok) throw new Error(`网页返回 HTTP ${response.status}`);
    return response.text();
  } catch (error) {
    if (error.name === "TimeoutError") throw new Error("网页访问超时，招聘平台可能限制了机器访问");
    if (/fetch failed/i.test(error.message || "")) throw new Error("服务器无法直接访问这个岗位页面，招聘平台可能做了反爬或需要登录");
    throw error;
  }
}

async function extractWithTavily(url) {
  if (!process.env.TAVILY_API_KEY) return null;
  try {
    const response = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      signal: AbortSignal.timeout(20000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        urls: [url],
        extract_depth: "advanced",
        include_images: false
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    const result = data.results?.[0];
    const content = result?.raw_content || result?.content;
    return content ? String(content) : null;
  } catch {
    return null;
  }
}

async function searchSourceUrlWithTavily(url) {
  if (!process.env.TAVILY_API_KEY) return null;
  const response = await searchWeb(url);
  const best = response.find((item) => item.url === url) || response[0];
  return best?.content || null;
}

export async function fetchJobFromUrl(sourceUrl) {
  const errors = [];
  const host = hostnameOf(sourceUrl);
  const isPlatform = isPlatformHost(host);
  try {
    const html = await fetchHtml(sourceUrl);
    const inferred = inferJobFromHtml(sourceUrl, html);
    if (!isPlatform || !isWeakInference(inferred)) return inferred;
    errors.push("平台页面可访问，但正文信息不足");
  } catch (error) {
    errors.push(error.message);
  }

  const extracted = await extractWithTavily(sourceUrl);
  if (extracted) {
    const inferred = inferJobFromHtml(sourceUrl, extracted);
    if (!isWeakInference(inferred)) {
      return {
        ...inferred,
        extractionNote: "直接访问岗位网页失败，已用 Tavily 抓取内容兜底预填。请保存前人工扫一眼。"
      };
    }
    errors.push("Tavily 抓到了页面，但没有足够的岗位正文");
  }

  const searched = await searchWeb(sourceUrl);
  if (searched.length) {
    const inferred = inferJobFromSearchResults(sourceUrl, searched);
    const officialCandidates = await searchOfficialCandidates(inferred);
    const bestOfficial = officialCandidates[0];
    const verificationStatus = bestOfficial ? "likely" : "unverified";
    return {
      ...inferred,
      officialUrl: bestOfficial?.url || "",
      verificationStatus,
      nextAction: bestOfficial ? "复核疑似官方招聘页，确认后再投递。" : "平台反爬导致无法确认真实性，建议补充 JD 或人工确认公司官方渠道。",
      officialVerification: {
        mode: "plan_b_search",
        verificationStatus,
        officialUrl: bestOfficial?.url || "",
        verificationNote: bestOfficial ? "平台原网页无法稳定抓取，已用搜索结果找到疑似官方渠道，仍需人工复核。" : "平台原网页无法稳定抓取，且未找到足够可靠的官方渠道。",
        evidence: officialCandidates.slice(0, 5),
        notes: [
          `${platformName(host)} 链接被当作岗位线索处理，没有绕过平台反爬。`,
          "没有官方渠道的岗位不会自动进入投递。"
        ],
        verificationActions: bestOfficial ? ["打开疑似官方链接复核岗位。", "确认标题/地点/部门一致后再投递。"] : ["让用户粘贴 JD 正文。", "搜索公司官网、公众号或公司域名 HR 邮箱。"]
      },
      extractionNote: bestOfficial
        ? "平台原页面无法稳定抓取，已改用搜索结果和疑似官方渠道预填。请复核后保存。"
        : "平台原页面无法稳定抓取，已从搜索结果摘要预填。真实性未确认，不建议自动投递。"
    };
  }

  const searchedText = await searchSourceUrlWithTavily(sourceUrl);
  if (searchedText) {
    return {
      ...inferJobFromHtml(sourceUrl, searchedText),
      verificationStatus: "unverified",
      nextAction: "搜索摘要不完整，建议补充 JD 正文或人工确认公司官方渠道。",
      extractionNote: "直接访问岗位网页失败，已用搜索结果摘要兜底预填。摘要可能不完整，建议补充 JD 正文。"
    };
  }

  const hint = process.env.TAVILY_API_KEY
    ? "Tavily 兜底也没有拿到正文"
    : "还没有配置 TAVILY_API_KEY，所以无法使用第三方网页抓取兜底";
  throw new Error(`${errors.join("；")}；${hint}`);
}

async function searchWeb(query) {
  if (!process.env.TAVILY_API_KEY) return [];
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, search_depth: "basic", max_results: 6 })
  });
  if (!response.ok) throw new Error(`搜索接口失败：HTTP ${response.status}`);
  const data = await response.json();
  return (data.results || []).map((item) => ({ title: item.title || "", url: item.url || "", content: item.content || "" })).filter((item) => item.url);
}

function overlapScore(a, b) {
  const left = new Set(extractKeywords(a));
  const right = extractKeywords(b);
  if (!left.size || !right.length) return 0;
  return right.filter((item) => left.has(item)).length / Math.max(1, Math.min(left.size, right.length));
}

function candidateLooksOfficial(url, company) {
  const host = hostnameOf(url);
  if (!host || isPlatformHost(host)) return false;
  if (/career|careers|jobs|join|recruit|zhaopin|hr/i.test(url)) return true;
  const token = String(company || "").replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "").slice(0, 8).toLowerCase();
  return Boolean(token && host.toLowerCase().includes(token));
}

async function searchOfficialCandidates(job) {
  if (!process.env.TAVILY_API_KEY || isWeakInference(job)) return [];
  const queries = [
    `${job.company} ${job.title} 招聘 官网`,
    `${job.company} ${job.title} careers`,
    `${job.company} ${job.title} jobs`,
    `${job.company} 校招 社招 ${job.title}`
  ];
  const all = [];
  for (const query of queries) all.push(...await searchWeb(query));
  const unique = [...new Map(all.map((item) => [item.url, item])).values()];
  return unique
    .filter((item) => candidateLooksOfficial(item.url, job.company))
    .map((item) => ({
      url: item.url,
      title: item.title,
      score: /career|careers|jobs|join|recruit|zhaopin|hr/i.test(item.url) ? 0.55 : 0.42,
      snippet: compactText(item.content, 260)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function compareCandidate(job, candidateUrl, html) {
  const inferred = inferJobFromHtml(candidateUrl, html);
  const titleHit = inferred.jdText.includes(job.title) || inferred.title.includes(job.title) || job.title.includes(inferred.title);
  const locationHit = !job.location || inferred.jdText.includes(job.location.split("-")[0]) || inferred.location.includes(job.location.split("-")[0]);
  const jdOverlap = overlapScore(job.jdText, inferred.jdText);
  const score = (titleHit ? 0.45 : 0) + (locationHit ? 0.15 : 0) + Math.min(0.4, jdOverlap);
  return { url: candidateUrl, title: inferred.title, company: inferred.company, location: inferred.location, score: Number(score.toFixed(2)), titleHit, locationHit, jdOverlap: Number(jdOverlap.toFixed(2)), snippet: inferred.jdText.slice(0, 240) };
}

export async function verifyJobOfficially(job) {
  const notes = [];
  const candidates = [];
  if (job.officialUrl) candidates.push({ url: job.officialUrl });
  if (process.env.TAVILY_API_KEY) {
    for (const query of [`${job.company} ${job.title} 招聘 官网`, `${job.company} careers ${job.title}`, `${job.company} jobs ${job.title}`]) {
      candidates.push(...(await searchWeb(query)).filter((item) => candidateLooksOfficial(item.url, job.company)));
    }
  } else {
    notes.push("未配置 TAVILY_API_KEY，无法自动搜索公司官网；只能检查已提供的官方链接。");
  }
  const unique = [...new Map(candidates.map((item) => [item.url, item])).values()].filter((item) => item.url && !isPlatformHost(hostnameOf(item.url))).slice(0, 5);
  const evidence = [];
  for (const candidate of unique) {
    try { evidence.push(compareCandidate(job, candidate.url, await fetchHtml(candidate.url))); }
    catch (error) { evidence.push({ url: candidate.url, score: 0, error: error.message }); }
  }
  evidence.sort((a, b) => (b.score || 0) - (a.score || 0));
  const best = evidence[0];
  const verificationStatus = best?.score >= 0.65 ? "verified" : best?.score >= 0.4 ? "likely" : "unverified";
  return {
    mode: process.env.TAVILY_API_KEY ? "auto" : "limited",
    verificationStatus,
    officialUrl: verificationStatus !== "unverified" ? best.url : "",
    verificationNote: verificationStatus === "verified" ? "已找到高匹配官方页面。" : verificationStatus === "likely" ? "找到疑似官方页面，需要人工复核。" : "未找到足够匹配的官方岗位页面。",
    evidence,
    notes,
    verificationActions: verificationStatus === "verified" ? ["优先使用官方页面投递。"] : ["继续搜索公司官网 careers / jobs / join 页面。", "找不到官方渠道则保持未验证。"]
  };
}
