# Pro 点数与交流升级迁移

本迁移位于 `prisma/migrations/20260716_pro_credits_discussion/migration.sql`，只执行 `ADD COLUMN`、新表和索引创建。它不会删除用户、报告、订单或旧余额。

## 应用

```bash
npx prisma migrate deploy
npx prisma generate
```

若当前数据库由早期的运行时 schema bootstrap 建立，先备份数据库，再执行上面的 SQL；不要使用 `prisma migrate reset`。

## 回滚

应用版本回滚时可以继续保留新增列和表，旧版本不会读取它们。只有确认数据不再需要后，才在单独的维护窗口删除 `RssFeed`、`RssItem`、`ReportDiscussionMessage`、`DiscussionReport`、`ExportArtifact` 及新增列。

## 旧永久解锁用户

`User.planType = 'byok'` 保留并被视为有效 Pro，不会被自动撤销。新订单不再发放永久解锁，而是发放可在 90 天内激活的 30 天 Pro 权益。
## Optional clean launch

If legacy reports, orders, RSS data and non-administrator accounts are no longer
needed, a guarded local command can clear only business data while retaining
super-administrator accounts, their `UserSettings` (including encrypted model
and search keys), and the global `AppSetting` platform configuration:

```bash
CONFIRM_RESET_BUSINESS_DATA=DELETE_NON_ADMIN_BUSINESS_DATA npm run reset:business-data
```

The command never runs from migrations or application startup. It refuses to
run if no `super_admin` user exists.
