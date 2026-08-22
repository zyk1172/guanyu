import { z } from 'zod';

export const UpdateAuditSchema = z.object({
  isPublic: z.boolean().optional(),
  indexable: z.boolean().optional(),
  isSourcePublic: z.boolean().optional(),
}).strict();
