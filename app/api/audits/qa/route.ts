import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { decryptSecret } from '@/lib/secret';

export async function POST(request: Request) {
  try {
    // 1. 登录校验
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录后再提问。' }, { status: 401 });
    }

    const body = await request.json();
    const { auditId, question, chatHistory } = body;

    if (!auditId || !question || question.trim().length === 0) {
      return NextResponse.json({ error: '提问参数有误' }, { status: 400 });
    }

    // 2. 从数据库中拉取对应的审视记录，作为完整上下文
    const auditRecord = await prisma.audit.findUnique({
      where: { id: auditId },
    });

    if (!auditRecord) {
      return NextResponse.json({ error: '未找到该审视记录。' }, { status: 404 });
    }

    if (!auditRecord.isPublic && auditRecord.userId !== user.id) {
      return NextResponse.json({ error: '你没有权限查看这条审视记录。' }, { status: 403 });
    }

    // 3. 构建深度追问提示词
    const systemPrompt = `你是一个针对特定新闻审视报告进行"交互式追问与事实推敲"的智能AI。

现在用户想针对以下这篇【新闻审视报告】向你提出一些批判性、探究性的问题。
你必须基于：
1. 新闻原文和新闻客观内容。
2. 已经生成的反向审视结果 JSON 细节（如利益博弈主体、替代解释、证据链等）。
3. 当前审视记录中已经保存的评分理由、证据强弱标注、联网搜索线索和继续追问清单。
4. 当前对话中的历史追问。

给出冷静、严谨、多维度且符合批判性思维的专业解答。
遵守底线原则：
1. 不得凭空编造事实或迎合阴谋论。
2. 所有推理和假设都要声明其推测不确定性、证据强弱、受影响的判断对象和下一步核验方式。
3. 如果相关材料不足，必须明确声明"仅凭当前审视和线索信息无法确切证实，仍待进一步事实核对"。
4. 不要输出隐藏推理过程，只输出结论、依据、核验不确定性和可核查的下一步。`;

    const recentHistory = Array.isArray(chatHistory) ? chatHistory.slice(-10) : [];

    const userMessageContent = `【新闻标题】：${auditRecord.title}
【新闻来源】：${auditRecord.source}
【发布时间】：${auditRecord.publishedAt || '未知'}
【分析模式】：${auditRecord.analysisMode}
【思考深度】：${auditRecord.reasoningDepth}
【使用模型】：${auditRecord.modelName}
【生成时间】：${auditRecord.createdAt.toISOString()}
【点击数】：${auditRecord.viewCount}
【公开状态】：${auditRecord.isPublic ? '公开展示' : '仅自己可见'}

【原始新闻正文】：
${auditRecord.originalContent}

【新闻总结】：${auditRecord.newsSummary}

【审视评分】：
- 可信度：${auditRecord.credibilityScore}
- 信息完整度：${auditRecord.informationCompletenessScore}
- 叙事倾向性：${auditRecord.narrativeBiasScore}
- 证据强度：${auditRecord.evidenceStrengthScore}
- 推测不确定性：${auditRecord.speculationRiskScore}

【完整反向审视JSON】：
${auditRecord.auditResultJson}

------------------------
【历史追问记录】：
${recentHistory.map((h: any) => `${h.role === 'user' ? '用户' : 'AI'}: ${String(h.content || '').slice(0, 1500)}`).join('\n')}

------------------------
用户当前提出的深度追问：
"${question}"

请给出客观严谨的解答：`;

    // 4. 读取当前用户数据库中的模型连接配置
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: user.id },
    });

    const apiKey = userSettings?.llmApiKeyEncrypted
      ? decryptSecret(userSettings.llmApiKeyEncrypted)
      : process.env.OPENAI_API_KEY;
    const baseURL = userSettings?.llmBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const modelName = auditRecord.modelName || process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o';

    if (!apiKey) {
      return NextResponse.json({ error: '未配置大模型 API Key，请先到账号管理中保存大模型密钥。' }, { status: 500 });
    }

    // 5. 请求大模型
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessageContent },
        ],
        temperature: 0.3, // 稍微允许一定推理性，但保持客观
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Q&A LLM failed:', errorText);
      return NextResponse.json({ error: '大模型交互失败' }, { status: 500 });
    }

    const resData = await response.json();
    const reply = resData.choices?.[0]?.message?.content || '未返回有效解答。';

    return NextResponse.json({ reply });

  } catch (error: any) {
    console.error('Route qa error:', error);
    return NextResponse.json({ error: '交互式提问服务器处理异常' }, { status: 500 });
  }
}
