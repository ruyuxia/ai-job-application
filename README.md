# AI 求职投递管家：可部署版

这是 Vercel + Supabase 版本，适合上线测试。

## 需要准备

- GitHub 账号
- Vercel 账号
- Supabase 项目
- DeepSeek API Key
- 视觉模型 API Key（OpenAI-compatible，例如 SiliconFlow 等）
- Tavily API Key

## 1. 创建 Supabase 表

打开 Supabase 项目：

1. 进入 SQL Editor
2. 新建 Query
3. 粘贴 `supabase/schema.sql`
4. 点击 Run

## 2. 配置环境变量

在 Vercel 项目 Settings -> Environment Variables 填：

```text
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的_DeepSeek_API_Key
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com

VISION_PROVIDER=openai-compatible
VISION_API_KEY=你的_视觉模型_API_Key
VISION_BASE_URL=https://api.siliconflow.cn/v1
VISION_MODEL=Qwen/Qwen2.5-VL-72B-Instruct

TAVILY_API_KEY=你的_Tavily_API_Key
NEXT_PUBLIC_SUPABASE_URL=你的_Supabase_Project_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的_Supabase_Anon_Key
SUPABASE_SERVICE_ROLE_KEY=你的_Supabase_Service_Role_Key
```

如果未来要切回 OpenAI，可以把 `AI_PROVIDER` 改成 `openai`，并配置：

```text
OPENAI_API_KEY=你的_OpenAI_API_Key
OPENAI_MODEL=gpt-4.1-mini
```

本地测试时，可以复制 `.env.example` 为 `.env.local`，填入同样内容。

## 3. 本地运行

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:3000
```

## 4. 部署到 Vercel

1. 把 `job-application-deploy` 上传到 GitHub 仓库。
2. 在 Vercel 里选择 Import Project。
3. Framework 选择 Next.js。
4. Root Directory 选择 `job-application-deploy`。
5. 填入环境变量。
6. 点击 Deploy。

## 当前版本边界

已经支持：

- 上传 txt / docx / 文本型 PDF 简历
- 填写求职意向
- 粘贴岗位链接并抓取 JD
- 调 DeepSeek / OpenAI 做岗位匹配、简历定制和投递话术
- 调视觉模型识别多张岗位截图并批量保存岗位
- 调 Tavily 搜索官方招聘页做岗位验证
- 保存投递状态到 Supabase
- 导出 CSV
- 手动维护投递进度和面试经验

暂时不支持：

- 用户登录
- 支付
- 自动登录招聘平台
- 绕过验证码
- 邮箱 OAuth 自动读取
- 扫描件 PDF OCR

正式商业版下一步建议：

- 加 Supabase Auth 用户登录
- 加 Stripe/Creem/国内支付
- 加文件对象存储
- 加后台管理页
- 加任务队列，避免大量岗位验证超时
