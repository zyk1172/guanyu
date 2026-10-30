<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## UI changes

Before changing rendered UI, read `DESIGN.md` and `.agents/skills/guanyu-ui-system/SKILL.md`. Reuse the primitives in `components/ui/`; page code must not introduce a separate control geometry, palette, focus style or browser confirmation dialog. Verify the rendered task on desktop and mobile after editing.
