# RSS News Stream Design

## Goal

Add a curated, rights-aware RSS headline stream to Guanyu. On desktop it occupies one quarter of the home analysis row; the existing news review input occupies the other three quarters. It displays only feed metadata and sends a selected article through the existing paid background review flow.

## Source policy

The catalog contains five internationally influential general-news sources and three Chinese sources with live official RSS endpoints. It is a curated discovery list, not a claim that any source is universally most authoritative. Each source is attributed and links to its original article. The application does not reproduce full RSS article text in the feed UI.

Sources are fetched only from a server-side catalog or from a validated public custom URL. The custom URL fetcher accepts HTTP(S) only, resolves DNS before every request and redirect, blocks localhost/private/link-local addresses, limits redirects, timeout and response size, and never accepts credentials in URLs.

## Access and settings

`AppSetting.adminRssFeedIdsJson` stores the platform default feed IDs. `UserSettings.rssFeedUrlsJson` stores a buyout user's selected catalog feeds and validated custom feeds. Super administrators edit the platform default. Point/free users can view the effective administrator selection but cannot change it. Buyout users can choose catalog sources and add up to five custom feeds.

## Data flow

1. Home calls `GET /api/rss/headlines`.
2. The endpoint resolves effective source configuration from the current account and fetches selected feeds concurrently.
3. `fast-xml-parser` parses RSS 2.0, RDF and Atom into normalized title, URL, published time and source records.
4. The RSS panel scrolls the normalized headlines. Selecting an item opens a compact preview; `开始观隅分析` requests the existing safe URL parser, then pre-fills the existing input form. If parsing fails, the user can open the source link and paste text as today.
5. Submitting the normal form creates the existing background job and consumes the same 3-point/deep-analysis quota.

## Verification

- Unit-test source selection, feed XML parsing, and custom URL validation.
- Test settings permissions and effective RSS configuration through route tests where practical.
- Run report tests, TypeScript, production build, and a local HTTP request against the RSS endpoint.
- Deploy the verified worktree to Vercel and check the deployment status and public endpoint.
