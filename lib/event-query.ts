/** A bounded fallback seed; the research planner extracts the actual event keywords. */
export function eventKeywordSeed(title: string, content = '') {
  const text = (title.trim() || content.replace(/\s+/g, ' ').trim().slice(0, 100))
    .normalize('NFKC').replace(/[\u0000-\u001f]/g, ' ')
    .replace(/^\s*(?:\d{4}[年/.-])?\d{1,2}[月/.-]\d{1,2}日?\s*[:：]\s*/, '')
    .split(/[，,。！？!?；;\n]/)[0]
    .replace(/(?:终于|公开)?(?:低头|言行不一|后续承压|引发热议|冲上热搜).*$/, '')
    .replace(/(?:针对|关于|就(?=[\p{Script=Han}])|事件|公开|正式)/gu, ' ')
    .replace(/(辱华|道歉|回应|地震|事故|调查|发布|延长|开放)/g, ' $1 ')
    .replace(/\s+/g, ' ').trim();
  return text.slice(0, 80).trim();
}

export function fallbackEventQueries(title: string, content = '', question = '', publishedAt = '') {
  const seed = eventKeywordSeed(title, content);
  const focus = question.replace(/(?:请问|请|帮我|搜索|搜一下|查一下|相关报道|这个事件|这件事|这篇报告|有没有|是否|什么|哪些|呢|吗|[？?])/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  const dated = /^\d{4}-\d{2}-\d{2}/.test(publishedAt) ? publishedAt.slice(0, 7) : '';
  return [...new Set([focus ? `${seed} ${focus}`.trim() : seed, seed, dated ? `${seed} ${dated}` : ''])].filter(value => value.length >= 2).map(value => value.slice(0, 120)).slice(0, 3);
}
