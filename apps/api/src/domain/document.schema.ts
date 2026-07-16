// domain/document.schema.ts  (Zod — the gate Claude's output must pass)
import { z } from 'zod';


export const actionPointSchema = z.object({
  task: z.string().min(3),
  owner: z.string().min(1).nullable(),
  deadlineIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export const documentContentSchema = z.object({
  title: z.string().min(3).max(120),
  missed5: z.array(z.string().min(5)).min(3).max(5),
  decisions: z.array(z.string().min(3)),
  actionPoints: z.array(actionPointSchema),
  openQuestions: z.array(z.string().min(3)),
});
