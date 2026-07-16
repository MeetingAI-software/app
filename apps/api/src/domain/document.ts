export interface ActionPoint {
  task: string;
  owner: string | null;        // MUST be a speaker name from the transcript, or null. Never invented.
  deadlineIso: string | null;  // "2026-07-18" — ONLY if a date was explicitly said. Never invented.
}

export interface DocumentContent {
  title: string;               // short + specific, e.g. "Q3 Budget Planning — 15 Jul 2026"
  missed5: string[];           // 3–5 bullets. THE product. Written for someone who was absent.
  decisions: string[];         // things actually DECIDED (not merely discussed)
  actionPoints: ActionPoint[];
  openQuestions: string[];     // unresolved / parked items
}
