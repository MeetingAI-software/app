// domain/document.schema.ts  (Zod — the gate Claude's output must pass)
import { z } from 'zod';

/**
 * Ceilings, not just floors. This content is rendered on the PUBLIC share page, so a model that
 * runs away — or a transcript crafted to make it run away — must not be able to persist an
 * unbounded blob. Set far above the length any of these fields is prompted to produce, so the
 * cap is a backstop against a runaway response rather than a limit a real document can hit.
 */
const MAX_LINE = 500;
const MAX_ITEMS = 30;
/** Action items are the one list a long meeting legitimately produces a lot of. */
const MAX_ACTION_POINTS = 50;

export const actionPointSchema = z.object({
  task: z.string().min(3).max(MAX_LINE),
  owner: z.string().min(1).max(120).nullable(),
  deadlineIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export const documentContentSchema = z.object({
  title: z.string().min(3).max(120),
  missed5: z.array(z.string().min(5).max(MAX_LINE)).min(3).max(5),
  decisions: z.array(z.string().min(3).max(MAX_LINE)).max(MAX_ITEMS),
  actionPoints: z.array(actionPointSchema).max(MAX_ACTION_POINTS),
  openQuestions: z.array(z.string().min(3).max(MAX_LINE)).max(MAX_ITEMS),
});
