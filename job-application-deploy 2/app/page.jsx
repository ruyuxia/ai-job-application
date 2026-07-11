"use client";

import { useEffect, useMemo, useState } from "react";

const emptyPreferences = {
  locations: "",
  salary: "",
  languages: "",
  exclusions: "",
  companyTypes: [],
  roleTypes: [],
  plan: "basic",
  allowCompanyResearch: false,
  notes: ""
};

const statusLabels = {
  company: "企业",
  job: "岗位",
  applied: "已投递",
  hr_reply: "HR回复",
  first_interview: "初面",
  second_interview: "复试",
  final_interview: "终面",
  offer: "Offer",
  lead: "待筛选",
  verified: "已验证",
  tailoring: "改简历",
  ready_for_review: "待确认",
  submitted: "已投递",
  waiting: "等回复",
  assessment: "测评",
  interview: "面试",
  offer: "Offer",
  rejected: "已拒绝",
  blocked: "需处理",
  unverified: "未验证"
};

const progressStages = ["company", "job", "applied", "hr_reply", "first_interview", "second_interview", "final_interview", "offer"];

const emptyJobForm = {
  company: "",
  title: "",
  location: "",
  language: "",
  sourceUrl: "",
  officialUrl: "",
  jdText: "",
  extractionNote: "",
  verificationStatus: "",
  nextAction: "",
  officialVerification: null
};

function pillClass(status) {
  if (["verified", "submitted", "interview", "offer", "hr_reply", "first_interview", "second_interview", "final_interview"].includes(status)) return "pill good";
  if (["ready_for_review", "likely", "assessment", "tailoring", "applied"].includes(status)) return "pill warn";
  if (["blocked", "unverified", "rejected"].includes(status)) return "pill bad";
  return "pill info";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: options.body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    ...options
  });
  const raw = await response.text();
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { error: raw.slice(0, 300) };
    }
  }
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

function createCustomerId() {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("job_app_customer_id");
  if (!id) {
    id = `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem("job_app_customer_id", id);
  }
  return id;
}

export default function Page() {
  const [screen, setScreen] = useState("workspace");
  const [customerId, setCustomerId] = useState("");
  const [profile, setProfile] = useState({ resumeText: "", preferences: emptyPreferences });
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [jobForm, setJobForm] = useState(emptyJobForm);
  const [jobDrafts, setJobDrafts] = useState([]);
  const [selectedDrafts, setSelectedDrafts] = useState([]);
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [message, setMessage] = useState("");
  const [capabilities, setCapabilities] = useState({ aiEnabled: false, searchEnabled: false, supabaseEnabled: false });

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) || jobs[0], [jobs, selectedJobId]);
  const exportHref = selectedJobs.length
    ? `/api/export.csv?customerId=${encodeURIComponent(customerId)}&jobIds=${encodeURIComponent(selectedJobs.join(","))}`
    : `/api/export.csv?customerId=${encodeURIComponent(customerId)}`;

  useEffect(() => {
    const id = createCustomerId();
    setCustomerId(id);
    refresh(id);
  }, []);

  async function refresh(id = customerId) {
    if (!id) return;
    const data = await api(`/api/state?customerId=${encodeURIComponent(id)}`);
    setProfile(data.profile || { resumeText: "", preferences: emptyPreferences });
    setJobs(data.jobs || []);
    setSelectedJobs((current) => current.filter((id) => (data.jobs || []).some((job) => job.id === id)));
    setCapabilities(data.capabilities || {});
  }

  useEffect(() => {
    setInterviewNotes(selectedJob?.analysis?.interviewNotes || "");
  }, [selectedJob?.id]);

  function show(text) {
    setMessage(text);
    setTimeout(() => setMessage(""), 2600);
  }

  function updatePreference(key, value) {
    setProfile((current) => ({
      ...current,
      preferences: { ...(current.preferences || emptyPreferences), [key]: value }
    }));
  }

  function toggleChoice(group, value) {
    const current = profile.preferences?.[group] || [];
    updatePreference(group, current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function uploadResume(file) {
    const formData = new FormData();
    formData.append("resume", file);
    const data = await api("/api/resume-upload", { method: "POST", body: formData });
    setProfile((current) => ({ ...current, resumeText: data.text }));
    show(data.note || "简历已读取");
  }

  async function saveProfile() {
    const saved = await api("/api/profile", {
      method: "POST",
      body: JSON.stringify({ customerId, resumeText: profile.resumeText, preferences: profile.preferences })
    });
    setProfile(saved);
    show("简历与求职意向已保存");
  }

  async function uploadJobScreenshots(files) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    try {
      show("正在识别岗位截图...");
      const formData = new FormData();
      selected.forEach((file) => formData.append("screenshots", file));
      const data = await api("/api/job-from-screenshots", { method: "POST", body: formData });
      const drafts = (data.jobs || []).map((job, index) => ({ ...emptyJobForm, ...job, draftId: `draft_${Date.now()}_${index}` }));
      setJobDrafts(drafts);
      setSelectedDrafts(drafts.map((job) => job.draftId));
      setJobForm(drafts[0] || emptyJobForm);
      show(`识别到 ${drafts.length} 个岗位，请勾选后保存`);
    } catch (error) {
      show(error.message || "岗位截图识别失败");
    }
  }

  async function extractJobText() {
    if (!jobForm.jdText?.trim()) return show("请先粘贴岗位 JD 内容");
    try {
      show("正在识别粘贴内容...");
      const job = await api("/api/job-from-text", { method: "POST", body: JSON.stringify({ jdText: jobForm.jdText }) });
      setJobForm((current) => ({ ...current, ...job }));
      setJobDrafts([]);
      setSelectedDrafts([]);
      show("岗位文字已自动填入");
    } catch (error) {
      show(error.message || "岗位文字识别失败");
    }
  }

  async function saveJob() {
    const saved = await api("/api/jobs", { method: "POST", body: JSON.stringify({ customerId, ...jobForm }) });
    setJobs((current) => [saved, ...current]);
    setSelectedJobId(saved.id);
    setJobForm(emptyJobForm);
    setScreen("workspace");
    show("岗位已保存");
  }

  async function saveSelectedDrafts() {
    const selected = jobDrafts.filter((job) => selectedDrafts.includes(job.draftId));
    if (!selected.length) return show("请先勾选要保存的岗位");
    const data = await api("/api/jobs/bulk", { method: "POST", body: JSON.stringify({ customerId, jobs: selected }) });
    setJobs((current) => [...(data.jobs || []), ...current]);
    setSelectedJobId(data.jobs?.[0]?.id || selectedJobId);
    setJobDrafts([]);
    setSelectedDrafts([]);
    setJobForm(emptyJobForm);
    setScreen("workspace");
    show(`已保存 ${data.jobs?.length || 0} 个岗位`);
  }

  function toggleDraft(id) {
    setSelectedDrafts((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleJob(id) {
    setSelectedJobs((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllJobs() {
    setSelectedJobs((current) => current.length === jobs.length ? [] : jobs.map((job) => job.id));
  }

  async function analyzeSelectedJobs() {
    if (!selectedJobs.length) return show("请先勾选岗位");
    show(`正在批量分析 ${selectedJobs.length} 个岗位...`);
    for (const id of selectedJobs) await analyzeJob(id);
    show("批量分析完成");
  }

  async function tailorSelectedJobs() {
    if (!selectedJobs.length) return show("请先勾选岗位");
    show(`正在批量定制 ${selectedJobs.length} 份简历...`);
    for (const id of selectedJobs) await tailorJob(id);
    show("批量定制完成");
  }

  async function deleteSelectedJobs() {
    if (!selectedJobs.length) return show("请先勾选岗位");
    const data = await api("/api/jobs/bulk", { method: "DELETE", body: JSON.stringify({ customerId, ids: selectedJobs }) });
    const deleted = new Set(data.deletedIds || []);
    setJobs((current) => current.filter((job) => !deleted.has(job.id)));
    setSelectedJobs([]);
    show(`已删除 ${deleted.size} 个岗位`);
  }

  async function verifyJob(id) {
    show(capabilities.searchEnabled ? "正在自动搜索官网验证..." : "搜索接口未配置，将做有限验证");
    const updated = await api(`/api/jobs/${id}/verify`, { method: "POST", body: JSON.stringify({ customerId }) });
    setJobs((current) => current.map((job) => job.id === id ? updated : job));
    setSelectedJobId(id);
    show("验证完成");
  }

  async function analyzeJob(id) {
    show(capabilities.aiEnabled ? "正在进行 AI 分析..." : "AI 未配置，将使用演示分析");
    const updated = await api(`/api/jobs/${id}/analyze`, { method: "POST", body: JSON.stringify({ customerId }) });
    setJobs((current) => current.map((job) => job.id === id ? updated : job));
    setSelectedJobId(id);
    show("分析完成");
  }

  async function tailorJob(id) {
    show(capabilities.aiEnabled ? "正在定制简历..." : "AI 未配置，将使用演示定制");
    const updated = await api(`/api/jobs/${id}/tailor`, { method: "POST", body: JSON.stringify({ customerId }) });
    setJobs((current) => current.map((job) => job.id === id ? updated : job));
    setSelectedJobId(id);
    show("定制简历已生成");
  }

  async function updateJobProgress(status = selectedJob?.status, notes = interviewNotes) {
    if (!selectedJob?.id) return show("请先选择岗位");
    const updated = await api(`/api/jobs/${selectedJob.id}`, {
      method: "PATCH",
      body: JSON.stringify({ customerId, status, interviewNotes: notes })
    });
    setJobs((current) => current.map((job) => job.id === selectedJob.id ? updated : job));
    setSelectedJobId(updated.id);
    show("进度已保存");
  }

  const metrics = {
    jobs: jobs.length,
    verified: jobs.filter((job) => job.verificationStatus === "verified").length,
    review: jobs.filter((job) => job.status === "tailoring" || job.analysis?.tailoredResume).length,
    emails: jobs.filter((job) => ["hr_reply", "first_interview", "second_interview", "final_interview", "offer"].includes(job.status)).length
  };

  return (
    <div className="app">
      <aside>
        <div className="brand"><span>AI</span><strong>求职投递管家</strong></div>
        {[
          ["workspace", "工作台"],
          ["profile", "简历与意向"],
          ["jobInput", "新增岗位"],
          ["progress", "投递进度"]
        ].map(([id, label]) => (
          <button key={id} className={screen === id ? "nav active" : "nav"} onClick={() => setScreen(id)}>{label}</button>
        ))}
        <a className="export" href={exportHref}>导出投递表</a>
      </aside>

      <main>
        <header>
          <div>
            <h1>AI 求职投递管家</h1>
            <p>{capabilities.aiEnabled ? "AI 已接入" : "AI 未接入"} · {capabilities.searchEnabled ? "官网验证已接入" : "官网验证未接入"} · {capabilities.supabaseEnabled ? "数据库已接入" : "数据库未接入"}</p>
          </div>
          <div className="header-actions">
            <button onClick={() => refresh()}>刷新数据</button>
            <button className="primary" onClick={() => setScreen("jobInput")}>添加岗位</button>
          </div>
        </header>

        <section className="notice">
          <strong>线上 MVP。</strong>
          <span>配置 OpenAI 后进行深度分析；配置 Tavily 后自动搜索官网验证；数据保存到 Supabase。</span>
        </section>

        {screen === "workspace" && (
          <section className="screen active">
            <div className="metrics">
              <Metric value={metrics.jobs} label="岗位数量" />
              <Metric value={metrics.verified} label="已验证" />
              <Metric value={metrics.review} label="已定制简历" />
              <Metric value={metrics.emails} label="面试/Offer" />
            </div>
            <div className="layout">
              <section className="panel">
                <div className="panel-head"><h2>岗位与投递状态</h2><span className="muted">已选 {selectedJobs.length} 个</span></div>
                <div className="bulk-actions">
                  <button className="small" onClick={toggleAllJobs}>{selectedJobs.length === jobs.length && jobs.length ? "取消全选" : "全选"}</button>
                  <button className="small" onClick={tailorSelectedJobs}>批量定制简历</button>
                  <button className="small" onClick={analyzeSelectedJobs}>批量分析</button>
                  <a className="button-link small" href={exportHref}>导出选中</a>
                  <button className="small danger" onClick={deleteSelectedJobs}>删除选中</button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th className="select-col"></th><th>岗位</th><th>匹配度</th><th>验证</th><th>状态</th><th>操作</th></tr></thead>
                    <tbody>
                      {jobs.length === 0 && <tr><td colSpan="6" className="empty">还没有岗位。先去“新增岗位”上传截图或粘贴 JD。</td></tr>}
                      {jobs.map((job) => (
                        <tr key={job.id}>
                          <td><input aria-label="选择岗位" type="checkbox" checked={selectedJobs.includes(job.id)} onChange={() => toggleJob(job.id)} /></td>
                          <td><strong>{job.title}</strong><div className="muted">{job.company} · {job.location || "地点未填"}</div></td>
                          <td>{job.fitScore ? `${job.fitScore}%` : "未分析"}</td>
                          <td><span className={pillClass(job.verificationStatus)}>{verificationText(job.verificationStatus)}</span></td>
                          <td><span className={pillClass(job.status)}>{statusLabels[job.status] || job.status}</span></td>
                          <td className="actions">
                            <button className="small" onClick={() => setSelectedJobId(job.id)}>查看</button>
                            <button className="small" onClick={() => verifyJob(job.id)}>验证</button>
                            <button className="small" onClick={() => tailorJob(job.id)}>定制</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <AnalysisPanel job={selectedJob} />
            </div>
          </section>
        )}

        {screen === "profile" && (
          <section className="screen active">
            <section className="panel form-panel">
              <div className="panel-head"><h2>简历与求职意向</h2><span className="pill">第 1 步</span></div>
              <label>上传简历<input type="file" accept=".txt,.md,.csv,.docx,.pdf" onChange={(event) => event.target.files?.[0] && uploadResume(event.target.files[0])} /><span className="muted">支持 txt、docx、文本型 PDF。</span></label>
              <label>简历内容<textarea value={profile.resumeText || ""} onChange={(event) => setProfile((current) => ({ ...current, resumeText: event.target.value }))} /></label>
              <div className="grid">
                <label>地点<input value={profile.preferences?.locations || ""} onChange={(event) => updatePreference("locations", event.target.value)} /></label>
                <label>薪资<input value={profile.preferences?.salary || ""} onChange={(event) => updatePreference("salary", event.target.value)} /></label>
                <label>语言<input value={profile.preferences?.languages || ""} onChange={(event) => updatePreference("languages", event.target.value)} /></label>
                <label>排除项<input value={profile.preferences?.exclusions || ""} onChange={(event) => updatePreference("exclusions", event.target.value)} /></label>
              </div>
              <div className="check-grid">
                <ChoiceGroup title="企业类型" name="companyTypes" values={["互联网", "AI 公司", "外企", "国企/央企", "初创公司"]} selected={profile.preferences?.companyTypes || []} onToggle={toggleChoice} />
                <ChoiceGroup title="职位类型" name="roleTypes" values={["AI 产品经理", "数据分析", "产品运营", "用户研究", "项目管理"]} selected={profile.preferences?.roleTypes || []} onToggle={toggleChoice} />
              </div>
              <label className="inline-check"><input type="checkbox" checked={Boolean(profile.preferences?.allowCompanyResearch)} onChange={(event) => updatePreference("allowCompanyResearch", event.target.checked)} />允许根据企业公开信息做企业分析。</label>
              <fieldset>
                <legend>套餐</legend>
                <label><input type="radio" name="plan" checked={(profile.preferences?.plan || "basic") === "basic"} onChange={() => updatePreference("plan", "basic")} />初级用户：最多定制 10 份简历</label>
                <label><input type="radio" name="plan" checked={profile.preferences?.plan === "pro"} onChange={() => updatePreference("plan", "pro")} />高级用户：不限简历定制数量</label>
              </fieldset>
              <label>补充说明<textarea value={profile.preferences?.notes || ""} onChange={(event) => updatePreference("notes", event.target.value)} /></label>
              <button className="primary" onClick={saveProfile}>保存简历与意向</button>
            </section>
          </section>
        )}

        {screen === "jobInput" && (
          <section className="screen active">
            <section className="panel form-panel">
              <div className="panel-head"><h2>新增岗位</h2><span className="pill">第 2 步</span></div>
              <label>岗位截图<input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => uploadJobScreenshots(event.target.files)} /><span className="muted">推荐。可一次上传多张同一岗位截图，适合手机端。</span></label>
              {jobDrafts.length > 0 && (
                <section className="draft-list">
                  <div className="panel-head inline-head"><h2>截图识别结果</h2><span className="muted">已选 {selectedDrafts.length} 个</span></div>
                  {jobDrafts.map((job) => (
                    <label className="draft-item" key={job.draftId}>
                      <input type="checkbox" checked={selectedDrafts.includes(job.draftId)} onChange={() => toggleDraft(job.draftId)} />
                      <span><strong>{job.title || "未识别岗位"}</strong><small>{job.company || "公司未识别"} · {job.location || "地点未识别"}</small></span>
                    </label>
                  ))}
                  <button className="primary" onClick={saveSelectedDrafts}>保存选中的岗位</button>
                </section>
              )}
              {jobForm.extractionNote && <div className="notice compact"><strong>{verificationText(jobForm.verificationStatus)}</strong><span>{jobForm.extractionNote}</span></div>}
              <details className="manual-details" open>
                <summary>查看/修改自动填入的信息</summary>
                <div className="grid">
                  {["company", "title", "location", "language"].map((field) => (
                    <label key={field}>{fieldLabel(field)}<input value={jobForm[field] || ""} onChange={(event) => setJobForm((current) => ({ ...current, [field]: event.target.value }))} /></label>
                  ))}
                </div>
                <label>官方链接<input value={jobForm.officialUrl || ""} onChange={(event) => setJobForm((current) => ({ ...current, officialUrl: event.target.value }))} /></label>
                <label>JD 内容<textarea value={jobForm.jdText || ""} onChange={(event) => setJobForm((current) => ({ ...current, jdText: event.target.value }))} placeholder="截图识别不准时，可以把岗位详情文字粘贴到这里。" /></label>
                <button onClick={extractJobText}>识别粘贴内容</button>
                {jobForm.nextAction && <label>下一步<input value={jobForm.nextAction || ""} onChange={(event) => setJobForm((current) => ({ ...current, nextAction: event.target.value }))} /></label>}
              </details>
              <button className="primary" onClick={saveJob}>保存岗位</button>
            </section>
          </section>
        )}

        {screen === "progress" && (
          <section className="screen active">
            <div className="layout">
              <section className="panel form-panel">
                <div className="panel-head"><h2>投递进度</h2><span className="pill">第 3 步</span></div>
                {!selectedJob && <div className="empty">请先在工作台选择一个岗位。</div>}
                {selectedJob && <>
                  <div className="selected-title"><strong>{selectedJob.company} · {selectedJob.title}</strong><span className="muted">{statusLabels[selectedJob.status] || selectedJob.status}</span></div>
                  <ProgressBar status={selectedJob.status} />
                  <fieldset>
                    <legend>当前阶段</legend>
                    {progressStages.map((stage) => (
                      <label key={stage}><input type="radio" name="progress" checked={selectedJob.status === stage} onChange={() => updateJobProgress(stage)} />{statusLabels[stage]}</label>
                    ))}
                  </fieldset>
                  <label>面试经验 / HR 反馈 / 复盘<textarea value={interviewNotes} onChange={(event) => setInterviewNotes(event.target.value)} placeholder="比如：HR 问了什么、面试官关注点、自己回答得好的地方、下次要改进的地方。" /></label>
                  <button className="primary" onClick={() => updateJobProgress(selectedJob.status, interviewNotes)}>保存进度与经验</button>
                </>}
              </section>
              <section className="panel"><div className="panel-head"><h2>岗位阶段总览</h2></div><div className="events">{jobs.map((job) => <div className="event" key={job.id}><span className={pillClass(job.status)}>{statusLabels[job.status] || job.status}</span><p><strong>{job.company} · {job.title}</strong></p><p className="muted">{job.analysis?.interviewNotes || job.nextAction || "暂无记录"}</p></div>)}</div></section>
            </div>
          </section>
        )}
      </main>
      {message && <div className="toast show">{message}</div>}
    </div>
  );
}

function Metric({ value, label }) {
  return <div className="metric"><b>{value}</b><span>{label}</span></div>;
}

function ChoiceGroup({ title, name, values, selected, onToggle }) {
  return (
    <fieldset>
      <legend>{title}</legend>
      {values.map((value) => <label key={value}><input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(name, value)} />{value}</label>)}
    </fieldset>
  );
}

function ProgressBar({ status }) {
  const current = Math.max(0, progressStages.indexOf(status));
  return (
    <div className="progress-bar">
      {progressStages.map((stage, index) => (
        <div className={index <= current ? "progress-step done" : "progress-step"} key={stage}>
          <span>{index + 1}</span>
          <small>{statusLabels[stage]}</small>
        </div>
      ))}
    </div>
  );
}

function AnalysisPanel({ job }) {
  if (!job) return <section className="panel detail"><div className="panel-head"><h2>分析结果</h2><span className="pill">未选择</span></div><div className="empty">选择岗位后查看分析结果。</div></section>;
  const analysis = job.analysis;
  const verification = job.officialVerification;
  return (
    <section className="panel detail">
      <div className="panel-head"><h2>分析结果</h2><span className="pill">{job.company} · {job.title}</span></div>
      {!analysis && !verification && <div className="empty">点击“验证”或“分析”后，这里会显示结果。</div>}
      <div className="analysis">
        {analysis && <>
          <Block title="分析模式">{analysis.mode === "ai" ? "AI 模式：已调用 OpenAI。" : "演示模式：规则粗分析。"}</Block>
          <Block title="匹配结论">{analysis.matchSummary}<p className="muted">匹配度：{analysis.fitScore || job.fitScore || "未评分"}%</p></Block>
          <Block title="优势"><pre>{listText(analysis.strengths)}</pre></Block>
          <Block title="缺口"><pre>{listText(analysis.gaps)}</pre></Block>
          <Block title="定制简历"><pre>{analysis.tailoredResume || analysis.resumeDraft || "暂无。点击“定制”生成针对这个岗位的简历。"}</pre></Block>
          <Block title="投递话术"><pre>{analysis.coverNote || "暂无"}</pre></Block>
          {analysis.interviewNotes && <Block title="面试经验"><pre>{analysis.interviewNotes}</pre></Block>}
        </>}
        {verification && <Block title="官方验证证据"><pre>{verification.verificationNote + "\n\n" + listText((verification.evidence || []).slice(0, 4).map((item) => `${item.url}｜匹配分 ${item.score ?? 0}`))}</pre></Block>}
      </div>
    </section>
  );
}

function Block({ title, children }) {
  return <div className="block"><h3>{title}</h3>{typeof children === "string" ? <p>{children}</p> : children}</div>;
}

function listText(items = []) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "暂无";
}

function verificationText(status) {
  return { verified: "已验证", likely: "疑似真实", unverified: "未验证", closed: "已关闭", duplicate: "重复" }[status] || status || "未验证";
}

function fieldLabel(field) {
  return { company: "公司", title: "岗位", location: "地点", language: "语言" }[field] || field;
}
