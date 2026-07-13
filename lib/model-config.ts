import { decryptSecret } from '@/lib/secret';

export function chooseModelConfig(params: {
  usageSource: string;
  userSettings: any;
  appSetting: any;
}) {
  if (params.usageSource !== 'byok') {
    return {
      modelName: params.appSetting?.adminModelName || process.env.OPENAI_MODEL_DEFAULT || 'gpt-4o',
      baseURL: params.appSetting?.adminLlmBaseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: params.appSetting?.adminLlmApiKeyEncrypted
        ? decryptSecret(params.appSetting.adminLlmApiKeyEncrypted)
        : (process.env.OPENAI_API_KEY || ''),
    };
  }

  return {
    modelName: params.userSettings?.defaultModelName || '',
    baseURL: params.userSettings?.llmBaseUrl || '',
    apiKey: params.userSettings?.llmApiKeyEncrypted
      ? decryptSecret(params.userSettings.llmApiKeyEncrypted)
      : '',
  };
}
