# 观隅

看见新闻没有展开的一角。

观隅是一个新闻叙事审视 Web App。它不替用户断言所谓隐藏真相，而是通过结构化方法拆解新闻中的主张、叙事框架、语言倾向、缺席视角、利益结构、证据强度、因果链条、替代解释和验证路径。

## 功能概览

- 多用户注册、登录、退出
- 账号管理和个人模型设置
- OpenAI-compatible Chat Completions API
- 观隅九镜审读法报告
- 新闻原文解析、新闻总结、审视报告保存
- 联网线索、继续提问、Markdown 导出
- 热门审视、我的审视、公开/私有切换
- Recharts 图形化核心指数和证据结构
- PostgreSQL 持久化数据库
- Docker 和 QNAP NAS 部署配置

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
- 应用监听 NAS 的 `5000` 端口
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
http://<NAS-IP>:5000
```

如果 NAS 拉 Docker Hub 很慢，可以在 `.env.qnap` 中覆盖镜像：

```dotenv
NODE_IMAGE=node:22-alpine
POSTGRES_IMAGE=postgres:18.2
```

Postgres 18 的持久化目录需要挂载到 `/var/lib/postgresql`，真实数据会位于：

```text
/share/SSD/container/guanyu/postgres/18/docker
```

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
