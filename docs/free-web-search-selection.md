# 免费联网搜索方案评估

GitHub 数据查询于 2026-10-13。星数用于了解采用情况，选择仍以功能、部署条件和失败处理为依据。

| 项目 | 查询时星数 | 用途与本项目取舍 |
| --- | ---: | --- |
| [SearXNG](https://github.com/searxng/searxng) | 38,306 | 成熟的自托管多引擎元搜索；沿用现有 Docker 集成，升级为固定搜索和模型工具共用的首选后端，增加故障回退。AGPL-3.0，作为独立服务使用，未复制其源码。 |
| [Crawl4AI](https://github.com/unclecode/crawl4ai) | 85,408 | 网页抓取、浏览器渲染与结构化提取，Apache-2.0。侧重抓取，不能单独提供搜索索引；需要 Python/浏览器服务，本轮不作为 Vercel 的默认依赖。 |
| [DDGS](https://github.com/deedy5/ddgs) | 3,018 | Python 元搜索库，MIT。可用于独立 Python 搜索服务，但当前项目采用 Node，不引入额外服务进程。 |
| [Open-WebSearch](https://github.com/Aas-ee/open-webSearch) | 1,855 | TypeScript 多引擎搜索与 MCP/CLI/HTTP 服务，Apache-2.0。参考多入口回退的方案，独立实现安全传输和页面解析，未引入其 MCP/浏览器运行时或复制源码。 |

本轮继续使用 SearXNG 和 Mozilla Readability，增加 Node 内的 Bing HTML、DuckDuckGo HTML/Lite 回退适配。无需 Chromium，也不新增 npm 依赖。结果统一为标题、URL、摘要；模型通过既有 Function Calling 工具自行选择搜索词、阅读正文和追踪链接，保留八种模型接口适配。

## 部署与启用

- **Vercel**：免费网页回退可在 Node 函数中运行，无需单独搜索 Key。需要稳定的 SearXNG 时，在自己的服务器运行服务并配置可访问的 HTTPS URL；Vercel 不会自动启动 Docker 服务。
- **Docker/NAS**：使用项目的 `docker-compose.web-research.yml` 覆盖配置，将 SearXNG 保持在应用内部网络。已部署应用需要构建包含本次改动的新版本。
- **已有模型**：在平台模型管理中选择「模型自主查证」，再运行连接测试。原生联网模式在付费搜索关闭时使用自主工具。固定搜索配置仍使用固定查询，适合无需工具调用的旧模型。
- **个人模型**：默认启用自主工具，只要求模型 Key；旧部署若曾显式设置 `GUANYU_CUSTOM_WEB_RESEARCH=false`，将其改为 `true` 才能启用自主工具。
- **费用**：默认 `GUANYU_ALLOW_PAID_SEARCH=false`，保存的付费搜索 Key 不会发起调用。模型调用、平台点数、自托管服务器和流量仍可能产生费用；不把免费搜索描述成全部任务免费。

## 验证

`npm run test:web-research` 覆盖多入口故障/空结果/验证码回退、链接解码、缓存、请求计数、内网保护以及八种模型的搜索与网页阅读往返。确定性测试使用模拟传输；公网实测应另外记录结果，外部限流不能用模拟测试代替。

本轮没有数据库迁移。既有成本快照不回写；新请求会分别记录实际使用的免费入口。

## 2026-10-31 更新

免费后备增加 Brave 公共网页及新闻页面解析，不需要搜索 API Key。报告追问增加关键词规划和资料预取，兼容不能调用函数的模型；详见 [事件追问与关键词检索](event-followup.md)。
