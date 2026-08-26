import { describe, it, expect } from 'vitest';
import { documentContentSchema } from './document.schema';

/** A document shaped like one a real meeting produces, used as the baseline for each case. */
function validContent(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Q3 Budget Planning — 15 Jul 2026',
    missed5: [
      'The hosting budget was raised to cover the new transcription provider.',
      'Launch slipped a week so the legal pages can be reviewed first.',
      'Alper owns the migration and reports back on Friday.',
    ],
    decisions: ['Move to annual billing for the Team plan.'],
    actionPoints: [{ task: 'Draft the migration plan', owner: 'Alper', deadlineIso: '2026-07-22' }],
    openQuestions: ['Do we need a second reviewer for the refund policy?'],
    ...overrides,
  };
}

describe('documentContentSchema', () => {
  it('accepts a realistic document', () => {
    expect(documentContentSchema.safeParse(validContent()).success).toBe(true);
  });

  // The ceilings below matter because this content renders on the PUBLIC share page: a runaway
  // model response must not be persistable as an unbounded blob.
  it('rejects an over-long decision', () => {
    const parsed = documentContentSchema.safeParse(validContent({ decisions: ['x'.repeat(501)] }));
    expect(parsed.success).toBe(false);
  });

  it('rejects an over-long missed5 entry', () => {
    const missed5 = [...validContent().missed5.slice(0, 2), 'x'.repeat(501)];
    expect(documentContentSchema.safeParse(validContent({ missed5 })).success).toBe(false);
  });

  it('rejects an over-long action point task and owner', () => {
    const longTask = [{ task: 'x'.repeat(501), owner: 'Alper', deadlineIso: null }];
    const longOwner = [{ task: 'Draft the plan', owner: 'x'.repeat(121), deadlineIso: null }];
    expect(documentContentSchema.safeParse(validContent({ actionPoints: longTask })).success).toBe(false);
    expect(documentContentSchema.safeParse(validContent({ actionPoints: longOwner })).success).toBe(false);
  });

  it('rejects an unbounded number of decisions, questions or action points', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `Item number ${i}`);
    expect(documentContentSchema.safeParse(validContent({ decisions: many(31) })).success).toBe(false);
    expect(documentContentSchema.safeParse(validContent({ openQuestions: many(31) })).success).toBe(false);

    const actionPoints = Array.from({ length: 51 }, () => ({
      task: 'Follow up',
      owner: null,
      deadlineIso: null,
    }));
    expect(documentContentSchema.safeParse(validContent({ actionPoints })).success).toBe(false);
  });

  it('accepts values sitting exactly on the limits', () => {
    const parsed = documentContentSchema.safeParse(
      validContent({
        decisions: ['x'.repeat(500)],
        actionPoints: [{ task: 'x'.repeat(500), owner: 'x'.repeat(120), deadlineIso: null }],
      }),
    );
    expect(parsed.success).toBe(true);
  });
});
