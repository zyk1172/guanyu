import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePlatformOperationCostCents,
  formatCreditCents,
  formatMultiplierBps,
  isOfficialOpenAiApiBaseUrl,
  localizedModelText,
  operationCostCents,
  parseMultiplierToBps,
} from '../lib/platform-model-core.mjs';

test('platform model costs use integer math and round upward to 0.5 credits', () => {
  assert.equal(operationCostCents('analysis', 100), 300);
  assert.equal(operationCostCents('completion', 100), 200);
  assert.equal(operationCostCents('followup', 100), 100);

  assert.equal(operationCostCents('analysis', 150), 450);
  assert.equal(operationCostCents('completion', 150), 300);
  assert.equal(operationCostCents('followup', 150), 150);

  assert.equal(operationCostCents('analysis', 220), 700);
  assert.equal(operationCostCents('completion', 220), 450);
  assert.equal(operationCostCents('followup', 220), 250);
  assert.equal(calculatePlatformOperationCostCents(300, 220), 700);
});

test('multiplier parsing is exact and rejects unsafe values', () => {
  assert.equal(parseMultiplierToBps('1'), 100);
  assert.equal(parseMultiplierToBps('1.5'), 150);
  assert.equal(parseMultiplierToBps('2.20'), 220);
  assert.equal(formatMultiplierBps(220), '2.2');
  assert.throws(() => parseMultiplierToBps('1.005'));
  assert.throws(() => parseMultiplierToBps('-1'));
  assert.throws(() => parseMultiplierToBps('Infinity'));
});

test('credit display preserves half credits without meaningless decimals', () => {
  assert.equal(formatCreditCents(300), '3');
  assert.equal(formatCreditCents(450), '4.5');
  assert.equal(formatCreditCents(250), '2.5');
});

test('localized model text follows exact locale then language and fallback', () => {
  const translations = JSON.stringify({ 'zh-CN': '基准模型', en: 'Baseline model', 'ja-JP': '基準モデル' });
  assert.equal(localizedModelText('Fallback', translations, 'zh-CN'), '基准模型');
  assert.equal(localizedModelText('Fallback', translations, 'en-US'), 'Baseline model');
  assert.equal(localizedModelText('Fallback', translations, 'ja-JP'), '基準モデル');
  assert.equal(localizedModelText('Fallback', '{}', 'de-DE'), 'Fallback');
});


test('native OpenAI endpoints accept only official HTTPS API bases', () => {
  assert.equal(isOfficialOpenAiApiBaseUrl('https://api.openai.com/v1'), true);
  assert.equal(isOfficialOpenAiApiBaseUrl('https://us.api.openai.com/v1'), true);
  assert.equal(isOfficialOpenAiApiBaseUrl('https://eu.api.openai.com/v1/'), true);
  assert.equal(isOfficialOpenAiApiBaseUrl('http://api.openai.com/v1'), false);
  assert.equal(isOfficialOpenAiApiBaseUrl('https://api.openai.com.evil.example/v1'), false);
  assert.equal(isOfficialOpenAiApiBaseUrl('https://example.com/v1'), false);
  assert.equal(isOfficialOpenAiApiBaseUrl('https://api.openai.com/v1?key=leak'), false);
});
