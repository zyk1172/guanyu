# 模型自主网页查证

在管理员的「平台模型管理 → 联网方式」中选择 **模型自主查证**。新闻审视和报告追问会向模型提供两个标准 Function Calling 工具：

- `web_search({ query })`：模型自行决定搜索词，取得标题、链接和摘要。
- `read_webpage({ url })`：读取公开网页正文和正文中的相关链接，供模型进一步追踪来源。

例如模型可以搜索某项政策，打开官方政策原文，再根据原文链接读取统计口径，最后生成包含这些来源的报告。搜索词、打开的网页和是否继续查证由模型决定；固定搜索模式也使用相同的免费搜索后端。不联网模式不发起搜索；付费搜索和供应商原生搜索默认关闭。

## 采用的成熟方案

- [SearXNG](https://github.com/searxng/searxng)：自托管、多引擎的网页搜索服务，不需要购买 Tavily/Serper 搜索 API Key。应用通过其[搜索协议](https://docs.searxng.org/dev/search_api.html)访问私有实例，管理员负责部署该服务。
- [Mozilla Readability](https://github.com/mozilla/readability)：Firefox 阅读模式使用的正文提取库，配合默认不执行脚本、不加载资源的 jsdom，将网页转成有长度上限的纯文本和相关链接。
- 标准工具调用协议：适配 OpenAI-compatible、OpenAI Responses、Anthropic Messages、Gemini，以及项目已有的 Qwen、Kimi、智谱、MiMo Chat Completions 接口。保留工具调用 ID、推理内容和服务商签名，逐轮记录 Token 用量。

也调研了 [browser-use](https://github.com/browser-use/browser-use) 和 [Playwright MCP](https://github.com/microsoft/playwright-mcp)。它们适合需要点击、填写表单或 JavaScript 交互的浏览器任务，但会引入浏览器进程或独立 Python 服务。当前新闻核验采用只读搜索和正文提取，兼容现有 Node、Docker/NAS 和 Vercel 部署，无需 Chromium。

## 搜索来源

默认无需 Tavily/Serper Key。自主模式和固定搜索共用免费回退链：

1. 使用 `WEB_RESEARCH_SEARXNG_URL` 指定的自托管 SearXNG；支持子路径与报告语言。
2. 服务未配置、超时、不可达、结果为空或格式错误时，读取 Bing 的公开搜索网页。
3. Bing 不可用时，依次尝试 DuckDuckGo HTML 和 Lite 页面。

每次搜索的整条链最多 15 秒，每个入口最多 4 秒、2 次重定向、2 MB。读取结果后停止回退，实际尝试次数进入用量记录。验证码和无法解析的页面不会被当作证据；全部失败时，工具返回错误和各入口的失败类别。固定搜索保留空来源，让报告说明无法核验。会话内相同搜索词（含多余空格）复用成功结果。公网入口不发送模型或搜索 API Key。

`GUANYU_ALLOW_PAID_SEARCH` 默认 `false`：已有 Tavily/Serper Key 也不会被调用；保存为原生联网的模型改用免费自主工具。管理员如确需恢复付费固定/原生搜索，必须显式设置 `GUANYU_ALLOW_PAID_SEARCH=true`；自主工具始终只走免费链路。

个人 OpenAI-compatible 模型默认启用自主工具，不再要求搜索 Key；设置 `GUANYU_CUSTOM_WEB_RESEARCH=false` 可改用免费固定搜索。平台模型选择「模型自主查证」后，模型自行搜索、读取、追踪证据；新建模型配置默认采用这一模式。已有「平台联网核验」配置继续使用固定查询，但后端已替换成免费链路。模型本身仍需 API Key 和 Function Calling 支持；模型费用与平台点数规则保持原样。

免费指无需购买搜索 API，不能保证外部网站永不限流，也不包含模型、服务器和流量成本。Bing/DuckDuckGo 共享出站 IP 可能被限制；稳定生产使用建议部署自己的 SearXNG，不使用随机公共实例。

方案调研、GitHub 星数和部署取舍见[免费搜索方案评估](free-web-search-selection.md)。

## Docker 中部署 SearXNG

在被忽略的 `.env` 中设置独立的随机 `SEARXNG_SECRET`，例如使用 `openssl rand -hex 32` 在自己的终端生成并保存。然后：

```bash
docker compose -f docker-compose.yml -f docker-compose.web-research.yml up -d --build
```

覆盖配置会启动固定 digest 的 SearXNG 镜像，启用 JSON 搜索格式，仅在 Compose 内部网络监听；不向主机发布搜索端口。应用等待它健康后启动，并设置：

```dotenv
WEB_RESEARCH_SEARXNG_URL=http://searxng:8080
WEB_RESEARCH_ALLOW_PRIVATE_SEARXNG=true
```

若应用运行在 Vercel，另行部署可访问的 HTTPS SearXNG 服务，再设置 `WEB_RESEARCH_SEARXNG_URL=https://你的搜索服务域名`；`WEB_RESEARCH_ALLOW_PRIVATE_SEARXNG` 保持 `false`。不要使用随机公共 SearXNG 实例作为固定生产依赖。QNAP host-network 部署可单独启动搜索服务并仅绑定本机端口，再配置其本机 URL 和明确的私网开关。

保存平台模型的自主模式后，点击「连接测试」。该测试要求模型实际搜索并成功读取结果页，只有返回了读取来源才判定网页工具可用；仅能回答连接标记不能通过此测试。模型不支持工具调用、搜索服务不可达或网页读取失败时，请根据测试结果检查模型/部署配置。

在需要 HTTP(S) 出站代理的托管云环境中，Node.js 24 可在进程启动前启用内置环境代理支持，例如 `NODE_USE_ENV_PROXY=1 npm run dev`。保留平台提供的 `HTTP_PROXY`、`HTTPS_PROXY`、`NO_PROXY` 和 CA 信任配置，保持 TLS 验证。项目的安全请求会固定经过验证的目标 IP；代理策略也必须允许这些请求，不能通过关闭验证或移除代理绕过拒绝。

## 边界和限制

每个查证会话最多 8 次工具调用，其中最多 4 次搜索和 4 次网页读取。成功结果在会话内复用；同一新闻分析的降级/语言修复请求共享会话和预算。最多 4 轮工具交互，最后一轮关闭工具以完成回答。单次网页请求最多 15 秒、2 MB，最多 4 次重定向；正文最多返回 12,000 字符及 12 条相关链接。

模型选择的 URL 必须为公开 HTTP(S) 地址。每个请求和重定向均经过项目现有的私网检查和 DNS 地址固定机制，拒绝 localhost、私网、云元数据地址及含凭据的 URL。允许私网 SearXNG 的开关只作用于管理员配置的搜索端点，不作用于模型选择的网页。网页没有用户 Cookie/Authorization，不执行页面脚本，不提交表单，不访问登录后的内容。

工具结果标记为不可信证据，系统提示明确禁止执行其中的指令。来源、正文摘录和搜索次数会进入报告/模型用量记录；网页工具查询不计入服务商「原生搜索」费用。外部内容仍需模型判断证据强度，抓到页面不等于事实得到独立证实。

当前不支持 JavaScript 渲染、PDF 下载、登录墙和交互式网页操作。限流、验证码和抓取失败都会作为工具错误交给模型，要求保留核验不确定性。这类能力可以后通过独立浏览器服务扩展，当前不会悄悄降级成伪造来源。

## 验证

```bash
npm run test:web-research
npm run ci
```

工具测试覆盖正文提取、脚本不执行、来源与缓存、参数校验、私网/重定向保护、预算和失败结果，以及八种服务商的「搜索 → 读取 → 最终回答」协议往返。测试使用本地模拟模型服务，不消耗真实模型额度。真实服务商的账号权限、工具兼容性和外部站点可达性请使用管理员连接测试验证。
