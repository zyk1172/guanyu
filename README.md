# 观隅

看见新闻没有展开的一角。

观隅是一个新闻叙事审视 Web App。它不替用户断言所谓隐藏真相，而是通过结构化方法拆解新闻中的主张、叙事框架、语言倾向、缺席视角、利益结构、证据强度、因果链条、替代解释和验证路径。

## 功能概览

- 邮箱验证码登录／首次自动注册、通行密钥（Passkey）登录，并保留密码登录
- 个人资料与头像编辑、验证后修改邮箱；管理员访问统计（PV/UV、趋势与热门页面）
- 账号管理和个人模型设置
- OpenAI-compatible Chat Completions API
- 观隅九镜审读法报告
- 新闻原文解析、新闻总结、审视报告保存
- 联网线索、继续提问、Markdown 导出
- 模型自主调用网页搜索与正文读取工具（SearXNG / Mozilla Readability）
- 首页关键词新闻检索：免费工具／可用的 DeepSeek API、正文提取和登录后恢复，见 [功能与部署说明](docs/homepage-news-search.md)
- 热门审视、我的审视、公开/私有切换
- Recharts 图形化核心指数和证据结构
- PostgreSQL 持久化数据库
- Docker 和 QNAP NAS 部署配置

上述登录、资料和统计功能的部署前提、数据库迁移及统计口径见 [部署说明](docs/access-profile-traffic.md)。

## 技术栈

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- NextAuth.js / Auth.js
- Recharts
- GSAP

## 环境变量

复制示例文件：

```bash
cp .env.example .env
```

核心变量：

```dotenv
POSTGRES_PASSWORD=replace-with-a-strong-postgres-password
DATABASE_URL=postgresql://guanyu:replace-with-a-strong-postgres-password@localhost:5432/guanyu?schema=public&connection_limit=10&pool_timeout=20
NEXTAUTH_SECRET=replace-with-a-long-random-secret
APP_ENCRYPTION_KEY=replace-with-a-long-random-secret-for-db-secrets
NEXTAUTH_URL=http://localhost:3000
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL_DEFAULT=gpt-4o
```

说明：

- `OPENAI_API_KEY` 可以留空，用户登录后在账号管理里保存自己的模型 API Key。
- `APP_ENCRYPTION_KEY` 用来加密数据库中的模型 API Key，生产环境必须固定且妥善保存。
- `DATABASE_URL` 用于应用运行时，Neon 推荐池化连接。`DIRECT_URL` 可选，供 Prisma CLI（包括部署迁移）优先使用非池化连接；若未设置，已知 Neon `-pooler` 域名自动转换为直连域名并移除 `pgbouncer` 参数，其他数据库地址保持原样。直连应与运行时指向同一数据库及 schema。Vercel 中优先配置 Production 的 `DIRECT_URL`，修改后重新部署。
- `REDIS_ENABLED=false` 可暂时停用 Upstash Redis（保持原凭据）；默认启用已配置的 Redis。重新启用前应确保旧缓存已过期或失效。变更 Vercel 环境变量后重新部署。

## 本地开发

模型自主查证的启用、无需搜索 API Key 的部署方式和工具限制见 [模型自主网页查证](docs/model-web-research.md)。

准备 PostgreSQL 后运行：

```bash
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

打开：

```text
http://localhost:3000
```

## Docker 使用

GitHub Actions 会在 `main` 分支发布镜像：

```text
ghcr.io/zyk1172/guanyu:latest
```

通用 Docker Compose：

```bash
cp .env.example .env
docker compose up -d
```

默认访问：

```text
http://localhost:5000
```

查看日志：

```bash
docker compose logs -f guanyu
docker compose logs -f postgres
```

停止：

```bash
docker compose down
```

保留数据库卷；如果要删除测试数据：

```bash
docker compose down -v
```

## QNAP NAS 部署

QNAP 专用配置文件：

```text
docker-compose.qnap.yml
```

特点：

- `guanyu` 使用 `network_mode: host`
- 应用只作为 HTTPS 反向代理的上游监听 NAS 的 `5000` 端口
- PostgreSQL 只绑定 NAS 本机 `127.0.0.1:55432`
- PostgreSQL 持久化到 `/share/SSD/container/guanyu/postgres`
- 适合 NAS 上已有 NewAPI 监听 `3000` 的场景

示例步骤：

```bash
mkdir -p /share/SSD/container/guanyu/app
mkdir -p /share/SSD/container/guanyu/data
mkdir -p /share/SSD/container/guanyu/postgres/18/docker
chown -R 999:999 /share/SSD/container/guanyu/postgres
chmod -R 700 /share/SSD/container/guanyu/postgres

cd /share/SSD/container/guanyu/app
cp .env.qnap.example .env.qnap
vi .env.qnap

docker compose -f docker-compose.qnap.yml --env-file .env.qnap up -d
```

QNAP 访问地址：

```text
https://你的观隅域名
```

在 Container Station 或 QNAP 反向代理中，将 HTTPS 域名转发至 `http://127.0.0.1:5000`，并只让反向代理保留对外入口。`.env.qnap` 必须配置匹配该域名的 `NEXTAUTH_URL=https://...` 与 `TRUST_PROXY_HEADERS=true`。生产环境直接以 `http://<NAS-IP>:5000` 登录会被拒绝，避免密码和会话 Cookie 经局域网明文传输。

基础镜像已按 digest 固定。不要在 `.env.qnap` 覆盖 `NODE_IMAGE`；更新镜像时应显式更新 Dockerfile 的 digest 并重建验证。

如果 NAS 本机运行受管理员控制的 NewAPI，可保留 `OPENAI_BASE_URL=http://127.0.0.1:3000/v1`，并仅在确认该地址不可被普通用户修改时设置：

```dotenv
ALLOW_PRIVATE_ADMIN_LLM=true
```

Postgres 18 的持久化目录需要挂载到 `/var/lib/postgresql`，真实数据会位于：

```text
/share/SSD/container/guanyu/postgres/18/docker
```

## 后台任务与邮件

Docker 镜像默认运行后台派发，每轮处理待运行审视、邮件队列与过期预扣。Vercel 使用配置的每日定时任务回收，也保留提交后执行与状态读请求恢复。需要更短的 Vercel 回收周期时，可以从有调度能力的执行器调用 `/api/cron/privacy`，使用部署的 `CRON_SECRET` 鉴权。

同时配置 SMTP 和 DirectMail 时，设置 `GUANYU_EMAIL_PROVIDER=smtp` 或 `GUANYU_EMAIL_PROVIDER=aliyun` 选择通道。管理员可在 `/admin/mail` 查看上游接受状态和追踪 ID，最终投递以收件服务器回执为准。

## 付款与订单

用户登录并创建订单后，通过订单专属收银台核对套餐、金额和币种，再打开付款入口。提交付款平台流水号后，管理员在收款平台核对实际到账、金额、币种和收款账号，再确认发放点数与 Pro 权益。历史待核对订单继续使用原有管理员入口。

可在部署变量中为基础点数包和专业点数包分别配置付款入口。PayPal 使用 `https://www.paypal.com/ncp/payment/<ID>`，支付宝使用 `https://qr.alipay.com/<ID>`。未配置付款链接时，收银台可按需读取随项目部署的对应收款码。渠道链接和收款码应对应实际使用的商户账号和套餐金额。

## DeepSeek 搜索 API（可选）

默认仍使用免费网页搜索。[DeepSeek 官方 Search API](https://api-docs.deepseek.com/guides/search) 是独立接口，并非 DeepSeek 聊天网页的联网开关，可搭配其他厂商的模型使用。

1. 部署者设置 `GUANYU_ALLOW_PAID_SEARCH=true` 后可启用付费搜索。关闭时，保存的密钥不会触发 DeepSeek 请求。
2. 管理员在 `/admin/search` 配置首页专用的 DeepSeek 密钥、平台日上限和可选辅助模型。辅助模型默认关闭，启用后可能产生模型用量。报告联网配置继续在 `/admin/models` 管理。
3. 个人模型：有效 Pro 用户进入「账号管理 → 模型设置 / 审视偏好 → 自定义 API」，在 DeepSeek Search API 设置中选择搜索来源、填写 Key 并保存。
4. 模型 Key 和搜索 Key 独立保存。留空保留旧 Key；「清除已保存的搜索密钥」需保存后生效，并切回默认搜索。密钥加密保存，设置接口不会回显。

请求固定发送到 `https://api.deepseek.com/v1/tools/search`；模型自主查证和报告追问会使用所选来源，网页正文读取仍使用现有免费安全抓取工具。关闭联网的模型不会调用搜索。

官方公布价格为每千次成功且返回结果的搜索 $0.75；失败、超时和空结果不计费。模型服务费用另计。成本记录默认使用每次 750 微美元，可通过 `SEARCH_UNIT_COST_MICROS_JSON={"deepseek":750}` 按合同费率覆盖。官方提到的部分 Harness 服务端工具临时免费活动不等同于本项目直接调用 API 免费。

部署迁移会把此前首页已绑定的有效平台搜索密钥复制到独立设置。更换报告模型或搜索密钥不会重置首页的当日平台额度。

## 数据库

空库与有 Prisma 迁移历史的存量库使用同一命令。存量库的账号、报告和点数保留。仅通过 `db push` 建库且没有迁移历史的实例，需要按实际数据库结构补记基线和历史迁移。先核对副本，再登记已应用的迁移。

同步 schema：

```bash
npx prisma migrate deploy
```

生成 Prisma Client：

```bash
npx prisma generate
```

生产容器启动时会执行：

```bash
./node_modules/.bin/prisma db push --skip-generate
```

## 安全注意事项

- 不要提交 `.env`、`.env.local`、`.env.qnap`。
- 不要提交 SQLite、PostgreSQL 数据目录、导出文件或备份文件。
- 不要把 OpenAI/NewAPI token 写入 README、compose 或源码。
- 用户模型 API Key 会加密存储到数据库，依赖 `APP_ENCRYPTION_KEY`。
- 公开部署前请确认 `NEXTAUTH_URL` 和数据库密码已改成生产值。

## 常用命令

```bash
npm run build
npm run lint
docker build -t guanyu:latest .
docker compose up -d --build
```

## GitHub 镜像发布

仓库包含 GitHub Actions workflow：

```text
.github/workflows/docker-publish.yml
```

推送到 `main` 后会自动构建并发布：

```text
ghcr.io/zyk1172/guanyu:latest
ghcr.io/zyk1172/guanyu:sha-<commit>
```


### 小型新闻采集

`GUANYU_ARTICLE_CRAWL_HOSTS` 填逗号分隔的已获许可的发布者主机名，例如 `news.example.org,www.example.net`，由站点管理的 RSS 提供候选。现有每小时首页预热在后台采集，单批最多 3 个站点，每站最多读取一个公开报道页面。采集遵守该站的 `robots.txt`，逐跳校验 HTTPS 与发布者主机，限制体积和超时。只缓存标题、来源、时间、可见正文和图片地址，缓存 24 小时供链接分析复用。首页快照仍只返回新闻预览。

### Gmail 投递排查

Gmail 投递可在 Vercel Runtime Logs 查询 `[email-delivery]`，再用「邮件投递记录」中的服务商追踪号对应 SMTP 或 DirectMail 的接收记录。日志只记录收件平台类别和诊断码。发件域名的 SPF、DKIM 和 DMARC 可按 Gmail 指引核对。 [Gmail 发件指南](https://support.google.com/a/answer/81126)
