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
- `DATABASE_URL` 支持 Prisma PostgreSQL 连接参数，例如 `connection_limit=10&pool_timeout=20`。

## 本地开发

模型自主查证的启用、无需搜索 API Key 的部署方式和工具限制见 [模型自主网页查证](docs/model-web-research.md)。

准备 PostgreSQL 后运行：

```bash
npm install
npx prisma generate
npx prisma db push
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

## DeepSeek 搜索 API（可选）

默认仍使用免费网页搜索。[DeepSeek 官方 Search API](https://api-docs.deepseek.com/guides/search) 是独立接口，并非 DeepSeek 聊天网页的联网开关，可搭配其他厂商的模型使用。

1. 部署者设置 `GUANYU_ALLOW_PAID_SEARCH=true`，允许显式启用付费搜索；未开启时保存的 Key 不会触发 DeepSeek 请求。
2. 平台模型：管理员进入「账号管理 → 系统管理 → 平台模型管理 → 编辑」，联网方式选「模型自主查证」或「平台联网核验」，再选择 DeepSeek Search API 并填写 Key。
3. 个人模型：有效 Pro 用户进入「账号管理 → 模型设置 / 审视偏好 → 自定义 API」，在 DeepSeek Search API 设置中选择搜索来源、填写 Key 并保存。
4. 模型 Key 和搜索 Key 独立保存。留空保留旧 Key；「清除已保存的搜索密钥」需保存后生效，并切回默认搜索。密钥加密保存，设置接口不会回显。

请求固定发送到 `https://api.deepseek.com/v1/tools/search`；模型自主查证和报告追问会使用所选来源，网页正文读取仍使用现有免费安全抓取工具。关闭联网的模型不会调用搜索。

官方公布价格为每千次成功且返回结果的搜索 $0.75；失败、超时和空结果不计费。模型服务费用另计。成本记录默认使用每次 750 微美元，可通过 `SEARCH_UNIT_COST_MICROS_JSON={"deepseek":750}` 按合同费率覆盖。官方提到的部分 Harness 服务端工具临时免费活动不等同于本项目直接调用 API 免费。

升级前应用仓库迁移 `20261022_deepseek_search_settings`：为个人设置和平台模型新增搜索来源与加密密钥字段，现有记录默认保持免费来源。使用仓库现有的 `npx prisma migrate deploy` 部署流程；已通过 `db push` 建立的环境须先完成迁移历史基线，不应在生产数据库执行重置。

## 数据库

同步 schema：

```bash
npx prisma db push
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
