import assert from 'node:assert/strict';
import test from 'node:test';
import { emphasizeReportMarkdown, getReportEmphasisRuns, reportEmphasisHtml } from '../lib/report-emphasis';

test('emphasis preserves every character and keeps uncertainty together', () => {
  const input = '报道提供了75份问卷，但不能据此确认全体居民需求。';
  const runs = getReportEmphasisRuns(input);
  assert.equal(runs.map(run => run.text).join(''), input);
  assert.ok(runs.some(run => run.bold && run.text.includes('不能据此确认')));
  assert.ok(runs.some(run => !run.bold));
});

test('every prose paragraph gets a selective highlight without changing line breaks', () => {
  const input = '图书馆已公布试点安排，但尚未披露运行成本。\n\n问卷反映受访者偏好，不能证明长期效果。';
  const runs = getReportEmphasisRuns(input);
  assert.equal(runs.map(run => run.text).join(''), input);
  assert.equal(runs.filter(run => run.bold).length, 2);
});

test('long English prose retains words, negation and most normal-weight text', () => {
  const input = 'The article gives an account of a local trial, but its central claim is not independently verified and cannot establish the needs of every resident in the wider community.';
  const runs = getReportEmphasisRuns(input);
  assert.equal(runs.map(run => run.text).join(''), input);
  const marked = runs.filter(run => run.bold).map(run => run.text).join('');
  assert.ok(marked.includes('not'));
  assert.ok(marked.length < input.length * 0.7);
  assert.doesNotMatch(marked, /\uFFFD/u);
});

test('Unicode and every enabled report language keep their original text', () => {
  for (const text of ['樣本代表性未知，仍需查核成本。', '調査結果は参考になるが、代表性は未確認です。', '자료는 참고할 수 있지만 독립적인 근거가 부족합니다.', 'Die Daten beschreiben den Versuch, die Wirkung ist nicht bestätigt.', 'Il documento presenta dei dati, ma non dimostra gli effetti.', '📚 报道说明试点计划，证据仍然不足。']) {
    const runs = getReportEmphasisRuns(text);
    assert.equal(runs.map(run => run.text).join(''), text);
    assert.ok(runs.some(run => run.bold));
    assert.ok(runs.every(run => !/[\uD800-\uDBFF]$/u.test(run.text) && !/^[\uDC00-\uDFFF]/u.test(run.text)));
  }
});

test('URLs, link syntax, email addresses, code and numeric scores stay intact', () => {
  for (const text of ['https://example.test/report/**data**?a=1&b=2', '[原始文件](https://example.test/report)', '`do_not_change(**value**)`', 'review@example.test', '75/100']) {
    assert.deepEqual(getReportEmphasisRuns(text), [{ text, bold: false }]);
  }
});

test('intentional inline emphasis becomes runs and malformed markers remain text', () => {
  assert.deepEqual(getReportEmphasisRuns('结果**仍待核验**，不能断言。'), [{ text: '结果', bold: false }, { text: '仍待核验', bold: true }, { text: '，不能断言。', bold: false }]);
  const input = '原始文字包含**未闭合标记。';
  assert.equal(getReportEmphasisRuns(input).map(run => run.text).join(''), input);
});

test('HTML output escapes untrusted text rather than interpreting markup', () => {
  const html = reportEmphasisHtml('<img src=x onerror="alert(1)">\n**尚未核验** & <script>alert(1)</script>');
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('<strong>尚未核验</strong>'));
  assert.doesNotMatch(html, /<(?:script|img)\b/u);
});

test('Markdown retains structure, code, metadata, hyperlinks and exact source appendix', () => {
  const original = '原文有**原始星号**，不得更改。\n第二行 https://source.test/a?x=1&y=2';
  const input = '# 报告\n\n## 报告信息\n- 报告编号：abc-123\n\n## 关键发现\n报道提供了问卷数据，但缺少独立核验。\n- 问卷反映部分偏好，不能代表全体居民。\n```json\n{"original":"不要改"}\n```\n[来源](https://source.test/a)\n\n## 附录：新闻原文\n' + original;
  const output = emphasizeReportMarkdown(input);
  assert.ok(output.includes('**但缺少独立核验**'));
  assert.ok(output.includes('- 问卷反映部分偏好，**不能代表全体居民**。'));
  assert.ok(output.includes('- 报告编号：abc-123'));
  assert.ok(output.includes('```json\n{"original":"不要改"}\n```'));
  assert.ok(output.includes('[来源](https://source.test/a)'));
  assert.ok(output.endsWith(original));
  assert.equal(emphasizeReportMarkdown(output), output);
});

test('Markdown tables preserve header separators, escaped pipes and score values', () => {
  const input = '| 指标 | 说明 | 分数 |\n| --- | --- | --- |\n| 可信度 | 已有调查，但缺少交叉核验\\|资料 | 75 |';
  const output = emphasizeReportMarkdown(input);
  assert.ok(output.startsWith('| 指标 | 说明 | 分数 |\n| --- | --- | --- |'));
  assert.ok(output.includes('\\|'));
  assert.ok(output.endsWith('| 75 |'));
});
