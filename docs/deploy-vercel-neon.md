# Vercel + Neon 部署说明

本说明用于把“观隅”部署到 Vercel，并使用 Neon PostgreSQL 作为数据库。

## 1. 创建 Neon 数据库

1. 在 Neon 新建一个 Project。
2. 进入数据库连接信息，复制 PostgreSQL 连接串。
3. 推荐使用 pooled connection string，并保留 SSL 参数。
4. 最终 `DATABASE_URL` 形如：

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require&connection_limit=1&pool_timeout=20"
```

## 2. 配置 Vercel 环境变量

在 Vercel 项目的 Environment Variables 中配置 `.env.vercel.example` 里的变量。

必填项：

```dotenv
DATABASE_URL=
NEXTAUTH_SECRET=
APP_ENCRYPTION_KEY=
NEXTAUTH_URL=
SUPER_ADMIN_EMAILS=admin@example.com
ADMIN_NOTIFY_EMAILS=admin@example.com
```

可选但推荐（Upstash Redis 缓存，加速热门榜、审视详情、全局设置读取，并承担分析限流计数）：

```dotenv
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

两个值都在 Upstash 控制台数据库 Details 页的 REST 区域复制。不配置或 Redis 故障时，应用自动回退为直连数据库，功能不受影响。

模型与搜索有两种配置方式：

- 推荐：部署后用超级管理员账号在“账号管理”里设置全局大模型和 Tavily / Serper。
- 备用：在 Vercel 环境变量中配置 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL_DEFAULT`、`TAVILY_API_KEY`、`SERPER_API_KEY`。

如果从 NAS 数据库迁移已有用户设置，`APP_ENCRYPTION_KEY` 必须与 NAS 当前生产环境一致，否则数据库里已加密的模型密钥和搜索密钥无法解密。全新 Neon 数据库可以使用新的 `APP_ENCRYPTION_KEY`。

### 邮件投递配置

报告完成、订单提交/确认/驳回、点数到账、账号封禁或恢复都会写入 `EmailDelivery` 投递记录，并发送给相关用户；报告完成时还会额外发送给 `ADMIN_NOTIFY_EMAILS` 和超级管理员。必须至少配置一套真实的发信通道：

```dotenv
SMTP_HOST=smtpdm.aliyun.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=system@your-domain.example
SMTP_PASS=your-smtp-password-or-token
SMTP_FROM=system@your-domain.example
SMTP_FROM_NAME=观隅
ADMIN_NOTIFY_EMAILS=admin@example.com
```

也可以改用阿里云 DirectMail 的 `ALIYUN_ACCESS_KEY_ID`、`ALIYUN_ACCESS_KEY_SECRET` 与 `ALIYUN_DM_ACCOUNT_NAME`。两个通道同时存在时，系统先尝试 SMTP，再回退 DirectMail；每封邮件失败会重试一次，并在超级管理员账号管理页显示通道、失败原因和重试次数。仅创建了空环境变量不算完成配置。

## 3. 初始化 Neon 表结构

在本机项目目录执行：

```bash
DATABASE_URL='你的 Neon 连接串' npx prisma db push
```

如果使用 Vercel CLI 管理环境变量，也可以先拉取生产环境变量：

```bash
vercel env pull .env.local --environment=production --yes
npx prisma db push
```

## 4. 本地构建检查

```bash
npm install
npm run lint
npm run test:report
npm run build
```

## 5. 部署到 Vercel

首次链接项目：

```bash
vercel link
```

预览部署：

```bash
vercel
```

生产部署：

```bash
vercel --prod
```

也可以把 GitHub 仓库接到 Vercel，让 `main` 分支自动部署。

## 6. 首次上线后的检查

1. 打开 Vercel 生产域名。
2. 使用配置在 `SUPER_ADMIN_EMAILS` 中的管理员邮箱注册或登录。
3. 确认账号具有超级管理员权限。
4. 在“账号管理”中保存全局大模型、Base URL、API Key、Tavily / Serper 搜索配置。
5. 用快速审视生成一篇测试报告。
6. 用深度审视生成一篇测试报告，确认联网核验结果出现。
7. 打开报告详情页，测试追问功能。
8. 生成一份报告后，在“账号管理”的“邮件投递记录”确认创建者和 `ADMIN_NOTIFY_EMAILS` 中的管理员均出现 `sent` 状态；若是 `failed`，按记录中的通道和错误修正 Vercel 邮件变量。

## 7. Vercel 部署注意事项

- Vercel 不能访问 NAS 局域网地址，例如 `http://192.168.x.x:3000/v1`，模型 Base URL 必须是公网可访问地址。
- 当前分析接口最长执行时间配置为 300 秒，追问接口为 120 秒。
- Vercel 不会执行 Dockerfile 里的 `prisma db push`，数据库表结构需要手动执行或放入 CI 流程。
- 新闻网页抓取在 Vercel 海外网络环境下可能遇到目标站限制，失败时应让用户手动粘贴正文。
