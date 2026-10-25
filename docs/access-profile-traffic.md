# 登录、个人资料与访问统计

## 需求归纳与实施范围

目标是降低首次使用的登录成本，让已有用户快速返回，并让管理员能判断是否有人访问。采用以下三批实现，统一提交便于联调：

1. **登录入口**：邮箱验证码同时承担注册和登录；新邮箱验证成功后自动创建普通账号，沿用现有赠送点数规则，后续登录不重复赠送。不再要求首次填写密码、确认密码和个人资料。保留老账号密码登录、邮箱找回密码和公开示例报告。
2. **通行密钥与资料**：集成 [SimpleWebAuthn](https://simplewebauthn.dev/) 的浏览器及服务端库，支持添加多个命名的 Passkey、设备解锁登录、移除密钥。保留邮箱作为跨设备恢复入口。显示名称、头像、性别、国家或地区均选填；只有显示名称参与讨论展示，性别和地区不公开。头像限 2 MB 的 JPG/PNG/WebP，由服务端校验并转为去除元数据的 256×256 WebP。修改邮箱须验证新邮箱，并使其他登录会话、扩展会话失效；账号 ID、报告、余额和密钥不变。
3. **管理统计**：在账号管理的“系统管理”顶部增加今日与近 7/30 天的 PV、UV、未登录/已登录浏览量、每日趋势、可展开的数据表和热门页面。仅超级管理员可读取接口。

本批不开放匿名生成付费分析。首页、示例与现有公开报告仍可按原权限浏览；模型调用继续使用原有计费和权限规则。本仓库应用是 Next.js，WordPress 入口本身不在这个仓库内。

## 部署前提与迁移

- Node.js 20+，现有 Docker 镜像使用 Node.js 22，CI 使用 Node.js 24。
- `NEXTAUTH_URL` 必须等于用户实际打开应用的 HTTPS 域名和端口。Passkey 的 RP ID 从该配置的主机名推导，不信任请求 Host；只允许该 origin 的签名。不要频繁在 www、裸域或其他域名之间切换，已创建的密钥绑定域名。开发环境仅 localhost/127.0.0.1 可使用 HTTP。
- 如果 WordPress 提供入口，应链接或反向代理到应用的正式地址，登录页面需在浏览器顶层打开。当前应用禁止 iframe 嵌入，不能把 WordPress iframe 当成已经支持的部署方式。
- 生产环境需配置真实 SMTP 或阿里云 DirectMail、`NEXTAUTH_SECRET`、`HASH_PEPPER`。代理部署需正确设置 `TRUST_PROXY_HEADERS=true`，并由可信入口覆盖 `X-Forwarded-For`、`X-Forwarded-Proto`；Vercel 沿用已有可信代理识别。新验证码发送失败会明确报错，不会在生产中将开发日志当成成功投递。
- 不支持 Passkey 的浏览器仍可用邮箱验证码或现有密码。设备私钥与生物特征不发送给服务器；服务端保存公钥及计数器，并验证用户确认、域名和一次性、浏览器绑定的挑战。

新增迁移：`prisma/migrations/20261025_passkeys_profile_traffic/migration.sql`。只新增 User.gender/country 以及 Passkey、PasskeyChallenge、PageView 表和索引。

在应用停止接收新版本请求前备份数据库，使用部署环境现有安全连接配置执行：

```bash
npm ci --legacy-peer-deps
npx prisma generate
npx prisma migrate deploy
npm run build
```

仓库没有完整的初始建表迁移。已用 `db push` 或早期 runtime bootstrap 建库的线上环境，需要先核对并基线化已有迁移，不能直接假定 `migrate deploy` 能处理。也可以在确认旧表结构与 main 一致且该迁移尚未执行时，由运维执行本次 SQL，再登记本次迁移：

```bash
npx prisma db execute --file prisma/migrations/20261025_passkeys_profile_traffic/migration.sql
npx prisma migrate resolve --applied 20261025_passkeys_profile_traffic
```

后一种方式只登记本次迁移，不能代替已有迁移历史的核对。已有新字段/表时不要重复执行 SQL；不要运行 `migrate reset`，也不要对生产执行无审查的 `db push`。本次本地验证只修改隔离测试数据库，未连接线上数据库。

回退应用代码时可保留新增表/列；旧版仍可通过邮箱验证码及找回密码恢复密码账号。新建无密码账号的 password 字段使用不可验证标记，不是共享密码。无需删除新数据来回退。

## 统计口径与维护

- 由第一方客户端在可见页面记录，不依赖付费或第三方统计服务。PV 为页面加载/路由切换，刷新增加一次；不按滚动、hash 或查询参数变化计数。每次导航的事件 UUID 防止重试重复写入。
- UV 按第一方 HttpOnly 匿名 cookie 去重，cookie 有效期 90 天，数据库只存 HMAC。区间 UV 使用区间内去重，不相加每日 UV。换浏览器、清 cookie 会形成新访客；这不是实际人数统计。
- 日界采用北京时间（Asia/Shanghai）。区分的是未登录/已登录 **PV**，不会混称为独立人数。
- 仅记录白名单页面类别，报告详情统一记作 `/audits/:id`，不保存报告 ID、查询参数、来源 URL、原始 IP、原始 UA、个人资料或用户 ID。账号/管理、API 页面不计入。
- 尊重 DNT 与 GPC，过滤常见 bot/crawler/preview/headless UA；这是浏览器流量估计，无法完整识别伪装爬虫或阻止所有伪造请求。广告拦截、禁用脚本和 cookie 限制会导致少计。
- 统计从部署后开始，不补历史，也不从已有报告浏览次数反推网站访客。
- 沿用 `/api/cron/privacy` 的受保护清理任务：删除超过 90 天的访问明细及过期 Passkey 挑战。生产应每天调用该任务，参考现有 `CRON_SECRET` 认证方式。

## 验收

- `npm run test:access`：资料格式、敏感信息剥离、时区边界、首次/再次登录、验证码重放、重复赠送、权限与跨站请求、密钥归属、一次性挑战并发、统计幂等、邮箱变更及会话失效。
- 浏览器使用 Chromium 虚拟 WebAuthn 认证器验证实际生成密钥、免邮箱登录、多密钥管理、头像上传、资料保存和统计切换；并检查桌面和移动宽度。
- 虚拟认证器测试不能替代上线后在真实 iOS/Android/Windows/macOS 设备、正式域名和真实邮件通道上的验收。
