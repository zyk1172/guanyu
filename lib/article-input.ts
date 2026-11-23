import { z } from 'zod';
import { AppError } from './app-error';

export type ArticleInputCode = 'ARTICLE_BODY_MISSING' | 'ARTICLE_ACCESS_BLOCKED' | 'NOT_NEWS_ARTICLE' | 'ARTICLE_TITLE_MISMATCH' | 'ARTICLE_ASSESSMENT_FAILED';

const messages: Record<ArticleInputCode, string> = {
  ARTICLE_BODY_MISSING: '没有取得可分析的新闻正文，未生成报告、未扣分析点数。请打开原文检查，或粘贴完整正文。',
  ARTICLE_ACCESS_BLOCKED: '读到的是访问限制、登录、订阅或验证提示，未取得新闻正文；未生成报告、未扣分析点数。请打开原文检查后手动粘贴正文。',
  NOT_NEWS_ARTICLE: '当前内容不是可分析的新闻报道正文，未生成报告、未扣分析点数。请选择具体报道或粘贴新闻正文。',
  ARTICLE_TITLE_MISMATCH: '取得的正文与所选新闻明显不符，未生成报告、未扣分析点数。请检查原文链接，或手动粘贴正确正文。',
  ARTICLE_ASSESSMENT_FAILED: '模型未能确认新闻正文有效，未生成报告、未扣分析点数。请检查正文后重试。',
};

export class ArticleInputError extends AppError {
  constructor(code: ArticleInputCode) {
    super(code, messages[code], code === 'ARTICLE_ASSESSMENT_FAILED' ? 502 : 422);
  }
}

// Match page states rather than words such as “login” inside real reporting.
const pageHeading = /^(?:(?:error\s*)?(?:401|403|404|410|429|500|502|503|504)(?:\s*[-:：]?\s*(?:forbidden|not found|gone|too many requests|internal server error|bad gateway|service (?:temporarily )?unavailable|gateway timeout))?|access denied|forbidden|page not found|not found|service unavailable|bad gateway|just a moment|attention required|verify (?:you are|you're) human|checking your browser|sign in(?: to continue)?|log in(?: to continue)?|subscribe to (?:continue|read)|页面不存在|页面未找到|访问被拒绝|访问受限|安全验证|请先登录|登录后(?:查看|阅读)|订阅后(?:查看|阅读))[.!。！…]*$/i;
const accessPrompt = /^(?:sorry[,，]?\s*(?:you have been blocked|we couldn.?t find)|please (?:enable javascript(?: and cookies)? to continue|verify (?:you are|you're) human|sign in to continue|log in to (?:continue|read))|you (?:need to|must) (?:sign in|log in)|subscribe (?:now )?to (?:continue reading|read (?:the|this) (?:full )?article)|to continue reading[,，]? (?:please )?(?:sign in|subscribe)|请(?:开启|启用)\s*javascript|请完成.{0,12}(?:验证|验证码)|请登录(?:后|以)(?:继续|阅读|查看)|登录后(?:即可)?(?:阅读|查看)全文|订阅后(?:即可)?(?:阅读|查看)全文)/i;

export function assertArticleText(content: unknown, title = ''): asserts content is string {
  if (typeof content !== 'string') throw new ArticleInputError('ARTICLE_BODY_MISSING');
  const text = content.trim();
  const significant = text.replace(/[^\p{L}\p{N}]/gu, '');
  if (text.length < 50 || significant.length < 35) throw new ArticleInputError('ARTICLE_BODY_MISSING');
  const heading = title.trim().replace(/\s+[|–—-]\s+.+$/, '');
  if (pageHeading.test(heading)) throw new ArticleInputError('ARTICLE_ACCESS_BLOCKED');
  const firstLines = text.split(/\n+/).map(line => line.trim()).filter(Boolean).slice(0, 3);
  if (firstLines.some(line => pageHeading.test(line) || accessPrompt.test(line))) {
    throw new ArticleInputError('ARTICLE_ACCESS_BLOCKED');
  }
}

const assessmentSchema = z.object({
  status: z.enum(['usable', 'unavailable', 'not_news', 'title_mismatch']),
  evidence: z.string().max(800),
});

function comparable(value: string) { return value.replace(/\s+/g, ' ').trim(); }

/** A newly generated report must pass the model's input check before saving or billing. */
export function assertModelArticleAssessment(value: unknown, content: string) {
  const parsed = assessmentSchema.safeParse(value);
  if (!parsed.success) throw new ArticleInputError('ARTICLE_ASSESSMENT_FAILED');
  const assessment = parsed.data;
  if (assessment.status !== 'usable') {
    throw new ArticleInputError(({ unavailable: 'ARTICLE_BODY_MISSING', not_news: 'NOT_NEWS_ARTICLE', title_mismatch: 'ARTICLE_TITLE_MISMATCH' } as const)[assessment.status]);
  }
  const evidence = comparable(assessment.evidence);
  if (evidence.length < 12 || !comparable(content).includes(evidence)) throw new ArticleInputError('ARTICLE_ASSESSMENT_FAILED');
}
