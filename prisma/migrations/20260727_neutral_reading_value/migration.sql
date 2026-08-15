ALTER TABLE "Audit"
ALTER COLUMN "readingValue" SET DEFAULT '材料不足';

UPDATE "Audit"
SET "readingValue" = CASE "readingValue"
  WHEN '值得细读' THEN '深度阅读'
  WHEN '可以略读' THEN '概览阅读'
  WHEN '不值一读' THEN '有限参考'
  WHEN '暂无法判断' THEN '材料不足'
  WHEN 'Worth reading' THEN '深度阅读'
  WHEN 'Skimmable' THEN '概览阅读'
  WHEN 'Not Worth Reading' THEN '有限参考'
  WHEN 'Insufficient Information' THEN '材料不足'
  ELSE "readingValue"
END
WHERE "readingValue" IN (
  '值得细读',
  '可以略读',
  '不值一读',
  '暂无法判断',
  'Worth reading',
  'Skimmable',
  'Not Worth Reading',
  'Insufficient Information'
);
