import { exportLocalizedValue } from './export-language-core.mjs';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] || char));
}

function asText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function asItems(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function bulletText(items, formatter = (item) => asText(item)) {
  const content = asItems(items).map(formatter).filter(Boolean);
  return content.length ? content.map((item) => `- ${item}`).join('\n') : '- —';
}

function bulletHtml(items, formatter = (item) => asText(item)) {
  const content = asItems(items).map(formatter).filter(Boolean);
  if (!content.length) return '<p style="margin:0;color:#786f61">—</p>';
  return `<ul style="margin:8px 0 0;padding-left:20px">${content.map((item) => `<li style="margin:5px 0">${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function statusLabel(value, english) {
  const labels = english
    ? {
        source_supported: 'Supported by the article',
        externally_verified: 'Externally verified',
        partially_supported: 'Partially supported',
        pending_verification: 'Needs verification',
        unable_to_verify: 'Unable to verify',
      }
    : {
        source_supported: '原文支持',
        externally_verified: '外部已核验',
        partially_supported: '部分支持',
        pending_verification: '待核验',
        unable_to_verify: '暂无法确认',
      };
  return labels[value] || asText(value, '—');
}

function sectionHtml(title, body, accent = '#7a4f22') {
  return `<section style="margin:18px 0;padding:16px 18px;border:1px solid #dfcfad;border-radius:12px;background:#fffaf0">
    <h2 style="margin:0 0 10px;color:${accent};font-size:16px;line-height:1.35">${escapeHtml(title)}</h2>${body}
  </section>`;
}

function sectionText(title, body) {
  return `\n${title}\n${'-'.repeat(Math.max(8, title.length))}\n${body}\n`;
}

function renderFinding(item, english) {
  const title = asText(item?.title || item?.content, '—');
  const details = [
    asText(item?.content),
    `${english ? 'Evidence' : '证据'} ${asText(item?.evidenceGrade, '—')} · ${statusLabel(item?.verificationStatus, english)} · ${english ? 'Uncertainty' : '推测不确定性'} ${asText(item?.speculationRisk, '—')}`,
    item?.nextVerification ? `${english ? 'Next check' : '下一步核验'}: ${asText(item.nextVerification)}` : '',
  ].filter(Boolean).join('\n');
  return { title, details };
}

function renderSource(item, english) {
  const title = asText(item?.title || item?.content, '—');
  const details = [
    asText(item?.note || item?.content || item?.relevance),
    item?.url ? asText(item.url) : '',
    item?.verificationStatus ? `${english ? 'Status' : '核验状态'}: ${statusLabel(item.verificationStatus, english)} · ${english ? 'Evidence' : '证据'} ${asText(item.evidenceGrade, '—')}` : '',
  ].filter(Boolean).join('\n');
  return { title, details };
}

function collectionHtml(items, english, formatter = renderFinding) {
  const entries = asItems(items).map((item) => formatter(item, english));
  if (!entries.length) return '<p style="margin:0;color:#786f61">—</p>';
  return entries.map(({ title, details }) => `<div style="margin:10px 0;padding:11px 12px;border-left:3px solid #b98c4c;background:#f8f0df">
    <strong style="color:#2d251b">${escapeHtml(title)}</strong>
    <div style="margin-top:5px;color:#5f5546;white-space:pre-line">${escapeHtml(details)}</div>
  </div>`).join('');
}

function collectionText(items, english, formatter = renderFinding) {
  const entries = asItems(items).map((item) => formatter(item, english));
  return entries.length
    ? entries.map(({ title, details }) => `- ${title}\n  ${details.replace(/\n/g, '\n  ')}`).join('\n')
    : '- —';
}

function scoreRows(scores, english) {
  const labels = english
    ? [['credibility', 'Credibility'], ['informationCompleteness', 'Information completeness'], ['narrativeBias', 'Narrative steering'], ['evidenceStrength', 'Evidence strength'], ['speculationRisk', 'Speculation uncertainty']]
    : [['credibility', '可信度'], ['informationCompleteness', '信息完整度'], ['narrativeBias', '叙事倾向性'], ['evidenceStrength', '证据强度'], ['speculationRisk', '推测不确定性']];
  return labels.map(([key, label]) => ({ label, value: Number(scores?.[key] ?? 0) }));
}

export function buildReportCompletionEmail({ audit, report, reportUrl }) {
  const english = audit?.reportLanguage !== 'zh-CN' && audit?.reportLanguage !== 'zh-TW';
  const copy = english ? {
    subject: 'Guanyu analysis complete',
    heading: 'Your Guanyu analysis is ready',
    intro: 'The report below separates what the article states, what can reasonably be inferred, and what still needs independent verification.',
    reportLink: 'Open the full report',
    summary: 'News summary',
    conclusion: 'One-sentence Guanyu view',
    value: 'Reading value',
    readerGuide: 'How a general reader can read this',
    scores: 'Core indicators',
    layers: 'Conclusion layers',
    findings: 'Key findings',
    support: 'Evidence supporting the article narrative',
    gaps: 'Main information gaps',
    stakeholders: 'Key stakeholder relationships',
    alternatives: 'Alternative explanations',
    evidence: 'Evidence and verification status',
    roadmap: 'Verification roadmap',
    questions: 'Questions to ask next',
    cannot: 'What cannot yet be concluded',
    web: 'Online verification',
    risk: 'Interpretation boundary',
    metadata: 'Report details',
    confirmed: 'Can be confirmed',
    doubts: 'Reasonable doubts',
    uncertain: 'Cannot yet be determined',
  } : {
    subject: '观隅分析已完成',
    heading: '你的观隅分析已生成',
    intro: '以下报告严格区分原文陈述、合理推断和仍需外部核验的信息；请结合原始材料和多方来源阅读。',
    reportLink: '打开完整报告',
    summary: '新闻简要总结',
    conclusion: '一句话观隅审视',
    value: '阅读价值判断',
    readerGuide: '给普通读者的读法',
    scores: '核心指数',
    layers: '结论分层',
    findings: '最关键的发现',
    support: '支持原文叙事的证据',
    gaps: '主要信息缺口',
    stakeholders: '关键利益关系',
    alternatives: '替代解释对照',
    evidence: '证据与核验状态',
    roadmap: '验证路线图',
    questions: '继续追问清单',
    cannot: '目前不能直接得出的结论',
    web: '联网核验结果',
    risk: '解读边界与不确定性',
    metadata: '报告信息',
    confirmed: '可以确认',
    doubts: '可以合理怀疑',
    uncertain: '暂不能判断',
  };

  const onlineVerification = report?.onlineVerification || {};
  const evidenceSummary = report?.evidenceVerificationSummary || {};
  const scoreRowsList = scoreRows(report?.scores, english);
  const title = asText(audit?.title, english ? 'Untitled article' : '未命名新闻');
  const reportBody = [
    sectionHtml(copy.summary, `<p style="margin:0;color:#3f372c;line-height:1.8">${escapeHtml(asText(report?.newsSummary, '—'))}</p>`),
    sectionHtml(copy.conclusion, `<p style="margin:0;font-size:17px;font-weight:700;line-height:1.65;color:#2d251b">${escapeHtml(asText(report?.oneSentenceConclusion, '—'))}</p>`),
    sectionHtml(copy.value, `<p style="margin:0 0 6px;font-weight:700;color:#2d251b">${escapeHtml(exportLocalizedValue(audit?.reportLanguage, asText(report?.readingValue, '—')))}</p><p style="margin:0;color:#5f5546;line-height:1.75">${escapeHtml(asText(report?.readingValueReason, '—'))}</p>`),
    sectionHtml(copy.readerGuide, `<p style="margin:0;color:#3f372c;line-height:1.8">${escapeHtml(asText(report?.normalReaderGuide, '—'))}</p>`),
    sectionHtml(copy.scores, `<table role="presentation" style="width:100%;border-collapse:collapse">${scoreRowsList.map(({ label, value }) => `<tr><td style="padding:7px 0;color:#5f5546">${escapeHtml(label)}</td><td style="padding:7px 0;text-align:right;font-weight:700;color:#2d251b">${value}/100</td></tr>`).join('')}</table>`),
    sectionHtml(copy.layers, `<div><strong>${escapeHtml(copy.confirmed)}</strong>${bulletHtml(report?.conclusionLayers?.confirmed)}</div><div style="margin-top:11px"><strong>${escapeHtml(copy.doubts)}</strong>${bulletHtml(report?.conclusionLayers?.reasonableDoubts)}</div><div style="margin-top:11px"><strong>${escapeHtml(copy.uncertain)}</strong>${bulletHtml(report?.conclusionLayers?.cannotJudgeYet)}</div>`),
    sectionHtml(copy.findings, collectionHtml(report?.keyFindings, english)),
    sectionHtml(copy.support, collectionHtml(report?.supportingEvidence, english, (item) => ({ title: asText(item?.supportsNarrative || item?.content, '—'), details: [asText(item?.content), `${english ? 'Evidence' : '证据'} ${asText(item?.evidenceGrade, '—')} · ${statusLabel(item?.verificationStatus, english)}`, item?.limitation ? `${english ? 'Limitation' : '局限'}: ${asText(item.limitation)}` : ''].filter(Boolean).join('\n') }))),
    sectionHtml(copy.gaps, collectionHtml(report?.informationGaps, english, (item) => ({ title: asText(item?.title, '—'), details: [asText(item?.description), item?.whyItMatters ? `${english ? 'Why it matters' : '重要性'}: ${asText(item.whyItMatters)}` : '', item?.nextVerification ? `${english ? 'Next check' : '下一步核验'}: ${asText(item.nextVerification)}` : ''].filter(Boolean).join('\n') }))),
    sectionHtml(copy.stakeholders, collectionHtml(report?.stakeholderRelations, english, (item) => ({ title: asText(item?.role, '—'), details: [`${english ? 'Possible benefit' : '可能利益'}: ${asText(item?.possibleBenefit, '—')}`, `${english ? 'Possible cost' : '可能代价'}: ${asText(item?.possibleCost, '—')}`, item?.pendingVerification ? `${english ? 'Needs verification' : '待核验'}: ${asText(item.pendingVerification)}` : ''].filter(Boolean).join('\n') }))),
    sectionHtml(copy.alternatives, collectionHtml(report?.alternativeExplanations, english, (item) => ({ title: asText(item?.explanation, '—'), details: [`${english ? 'Plausibility' : '合理性'}: ${asText(item?.reasonableness, '—')} · ${english ? 'Uncertainty' : '推测不确定性'}: ${asText(item?.speculationRisk, '—')}`, asText(item?.currentEvidenceStatus), item?.neededVerification ? `${english ? 'Needed verification' : '需要核验'}: ${asText(item.neededVerification)}` : ''].filter(Boolean).join('\n') }))),
    sectionHtml(copy.evidence, `<p style="margin:0 0 8px"><strong>${english ? 'Strongest evidence' : '最强证据'}:</strong> ${escapeHtml(asText(evidenceSummary?.strongestEvidence, '—'))}</p><p style="margin:0"><strong>${english ? 'Weakest evidence' : '最弱证据'}:</strong> ${escapeHtml(asText(evidenceSummary?.weakestEvidence, '—'))}</p><div style="margin-top:10px"><strong>${english ? 'Pending verification' : '待核验事项'}</strong>${bulletHtml(evidenceSummary?.pendingVerificationClaims)}</div>`),
    sectionHtml(copy.roadmap, collectionHtml(report?.verificationRoadmap, english, (item) => ({ title: asText(item?.question, item?.target || '—'), details: [asText(item?.whyItMatters || item?.why_needed), item?.materialType || item?.material_type ? `${english ? 'Material' : '材料'}: ${asText(item?.materialType || item?.material_type)}` : '', item?.priority ? `${english ? 'Priority' : '优先级'}: ${asText(item.priority)}` : ''].filter(Boolean).join('\n') }))),
    sectionHtml(copy.questions, bulletHtml(report?.questionsToAsk || report?.questions_to_ask_next)),
    sectionHtml(copy.cannot, bulletHtml(report?.cannotConclude)),
    sectionHtml(copy.web, `<p style="margin:0 0 10px;color:#5f5546">${escapeHtml(onlineVerification?.enabled ? (onlineVerification?.status === 'has_results' ? (english ? 'External search sources were supplied for this report.' : '本报告已获得可用的外部搜索线索。') : (english ? 'Search was enabled but no reliable source was confirmed.' : '已启用联网搜索，但当前未找到可确认的可靠来源。')) : (english ? 'No external search source was available for this report.' : '本报告未获得可用的外部搜索来源。'))}</p><strong>${english ? 'Verified sources' : '已核验来源'}</strong>${collectionHtml(onlineVerification?.verifiedSources, english, renderSource)}<div style="margin-top:12px"><strong>${english ? 'Background sources' : '相关背景来源'}</strong>${collectionHtml(onlineVerification?.backgroundSources, english, renderSource)}</div><div style="margin-top:12px"><strong>${english ? 'Leads to verify' : '待核验线索'}</strong>${collectionHtml(onlineVerification?.pendingLeads, english, renderSource)}</div>`),
    sectionHtml(copy.risk, `<p style="margin:0;color:#3f372c;line-height:1.8">${escapeHtml(asText(report?.riskNotice, '—'))}</p>`, '#8b3a2e'),
  ].join('');

  const metadataRows = [
    [english ? 'Source' : '新闻来源', audit?.source],
    [english ? 'Model' : '使用模型', audit?.modelName],
    [english ? 'Thinking depth' : '思考深度', audit?.reasoningDepth],
    [english ? 'Generated' : '生成时间', audit?.createdAt ? new Date(audit.createdAt).toLocaleString(english ? 'en-US' : 'zh-CN', { timeZone: 'Asia/Shanghai' }) : '—'],
  ];
  const metadataHtml = sectionHtml(copy.metadata, `<table role="presentation" style="width:100%;border-collapse:collapse">${metadataRows.map(([label, value]) => `<tr><td style="padding:7px 0;color:#786f61;width:42%">${escapeHtml(label)}</td><td style="padding:7px 0;color:#2d251b">${escapeHtml(asText(value, '—'))}</td></tr>`).join('')}</table>`);
  const text = [
    `${copy.subject}: ${title}`,
    `${english ? 'Source' : '来源'}: ${asText(audit?.source, '—')}`,
    `${english ? 'Full report' : '完整报告'}: ${reportUrl}`,
    sectionText(copy.summary, asText(report?.newsSummary, '—')),
    sectionText(copy.conclusion, asText(report?.oneSentenceConclusion, '—')),
    sectionText(copy.value, `${exportLocalizedValue(audit?.reportLanguage, asText(report?.readingValue, '—'))}\n${asText(report?.readingValueReason, '—')}`),
    sectionText(copy.readerGuide, asText(report?.normalReaderGuide, '—')),
    sectionText(copy.scores, scoreRowsList.map(({ label, value }) => `${label}: ${value}/100`).join('\n')),
    sectionText(copy.layers, `${copy.confirmed}\n${bulletText(report?.conclusionLayers?.confirmed)}\n\n${copy.doubts}\n${bulletText(report?.conclusionLayers?.reasonableDoubts)}\n\n${copy.uncertain}\n${bulletText(report?.conclusionLayers?.cannotJudgeYet)}`),
    sectionText(copy.findings, collectionText(report?.keyFindings, english)),
    sectionText(copy.support, collectionText(report?.supportingEvidence, english, (item) => ({ title: asText(item?.supportsNarrative || item?.content, '—'), details: `${asText(item?.content)}\n${english ? 'Evidence' : '证据'} ${asText(item?.evidenceGrade, '—')} · ${statusLabel(item?.verificationStatus, english)}` }))),
    sectionText(copy.gaps, collectionText(report?.informationGaps, english, (item) => ({ title: asText(item?.title, '—'), details: `${asText(item?.description)}\n${english ? 'Next check' : '下一步核验'}: ${asText(item?.nextVerification, '—')}` }))),
    sectionText(copy.stakeholders, collectionText(report?.stakeholderRelations, english, (item) => ({ title: asText(item?.role, '—'), details: `${english ? 'Benefit' : '可能利益'}: ${asText(item?.possibleBenefit, '—')}\n${english ? 'Cost' : '可能代价'}: ${asText(item?.possibleCost, '—')}` }))),
    sectionText(copy.alternatives, collectionText(report?.alternativeExplanations, english, (item) => ({ title: asText(item?.explanation, '—'), details: `${english ? 'Evidence' : '证据状态'}: ${asText(item?.currentEvidenceStatus, '—')}\n${english ? 'Needed verification' : '需要核验'}: ${asText(item?.neededVerification, '—')}` }))),
    sectionText(copy.evidence, `${english ? 'Strongest evidence' : '最强证据'}: ${asText(evidenceSummary?.strongestEvidence, '—')}\n${english ? 'Weakest evidence' : '最弱证据'}: ${asText(evidenceSummary?.weakestEvidence, '—')}\n${bulletText(evidenceSummary?.pendingVerificationClaims)}`),
    sectionText(copy.roadmap, collectionText(report?.verificationRoadmap, english, (item) => ({ title: asText(item?.question || item?.target, '—'), details: asText(item?.whyItMatters || item?.why_needed, '—') }))),
    sectionText(copy.questions, bulletText(report?.questionsToAsk || report?.questions_to_ask_next)),
    sectionText(copy.cannot, bulletText(report?.cannotConclude)),
    sectionText(copy.web, `${english ? 'Verified sources' : '已核验来源'}\n${collectionText(onlineVerification?.verifiedSources, english, renderSource)}\n\n${english ? 'Background sources' : '相关背景来源'}\n${collectionText(onlineVerification?.backgroundSources, english, renderSource)}\n\n${english ? 'Leads to verify' : '待核验线索'}\n${collectionText(onlineVerification?.pendingLeads, english, renderSource)}`),
    sectionText(copy.risk, asText(report?.riskNotice, '—')),
  ].join('\n');

  return {
    subject: `${copy.subject}: ${title}`,
    text,
    html: `<div style="margin:0;padding:28px 16px;background:#f2ead9;font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;color:#2d251b;line-height:1.65">
      <main style="max-width:720px;margin:0 auto;background:#fffdf7;border:1px solid #dfcfad;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(87,61,27,.10)">
        <header style="padding:26px 26px 22px;background:#2d3937;color:#fff8e8"><div style="font-size:13px;letter-spacing:1.2px;opacity:.78">GUANYU / 观隅</div><h1 style="margin:9px 0 6px;font-size:25px;line-height:1.35">${escapeHtml(copy.heading)}</h1><p style="margin:0;color:#e8ddc6;line-height:1.75">${escapeHtml(title)}</p></header>
        <div style="padding:22px 26px"><p style="margin:0 0 16px;color:#5f5546;line-height:1.8">${escapeHtml(copy.intro)}</p>${metadataHtml}${reportBody}<p style="margin:24px 0 0;text-align:center"><a href="${escapeHtml(reportUrl)}" style="display:inline-block;padding:11px 18px;border-radius:9px;background:#7a4f22;color:#fff;text-decoration:none;font-weight:700">${escapeHtml(copy.reportLink)}</a></p></div>
      </main>
    </div>`,
  };
}
