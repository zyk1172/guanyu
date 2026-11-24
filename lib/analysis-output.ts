import { ArticleInputError, assertModelArticleAssessment } from './article-input';
import type { ModelInvocationResult } from './model-runtime';
import { ReportSchema, reportSchemaErrorPaths } from './report-schema';

function parseAssistantJSON(assistantMessage: string) {
  let cleanText = assistantMessage.trim();
  if (cleanText.startsWith('```json')) {
    cleanText = cleanText.substring(7, cleanText.length - 3).trim();
  } else if (cleanText.startsWith('```')) {
    cleanText = cleanText.substring(3, cleanText.length - 3).trim();
  }
  const start = cleanText.indexOf('{');
  const end = cleanText.lastIndexOf('}');
  if (start >= 0 && end > start) cleanText = cleanText.slice(start, end + 1);
  return JSON.parse(cleanText);
}

export function checkAnalysisOutput(result: ModelInvocationResult, content: string) {
  if (!result.ok) {
    return { ok: false as const, code: result.errorCode || `upstream_${result.status}`, retry: result.status >= 500 };
  }
  if (!result.message.trim()) return { ok: false as const, code: 'empty_response', retry: true };
  let parsed: unknown;
  try {
    parsed = parseAssistantJSON(result.message);
  } catch {
    return { ok: false as const, code: 'invalid_json', retry: true };
  }
  try {
    assertModelArticleAssessment((parsed as { inputAssessment?: unknown } | null)?.inputAssessment, content);
  } catch (error) {
    if (!(error instanceof ArticleInputError)) throw error;
    return { ok: false as const, code: error.code, retry: error.code === 'ARTICLE_ASSESSMENT_FAILED', articleError: error };
  }
  const validated = ReportSchema.safeParse(parsed);
  if (!validated.success) {
    console.warn('[analysis] Invalid report schema', { paths: reportSchemaErrorPaths(validated.error) });
    return { ok: false as const, code: 'model_output_schema_invalid', retry: true };
  }
  return { ok: true as const, report: validated.data };
}
