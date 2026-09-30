import { SurveyDefinition, SurveyQuestion, SurveyQuestionType } from './van-sales.models';
import { uuidV4 } from './van-uuid';

/**
 * The rules that make surveys data-driven (F11): which surveys a customer is
 * asked, which questions show given the answers so far, whether an answer is
 * complete, and whether a definition from the builder is sound enough to send
 * to the vans. Pure, so the builder and the field screen agree by construction.
 */

export type SurveyValue = string | number | boolean | string[] | null;

export const QUESTION_TYPES: { type: SurveyQuestionType; label: string; icon: string; hint: string }[] = [
  { type: 'YES_NO', label: 'Yes / No', icon: 'toggle', hint: 'A quick yes or no.' },
  { type: 'CHOICE', label: 'Single choice', icon: 'radio-button-on', hint: 'Pick one option.' },
  { type: 'MULTI_CHOICE', label: 'Multiple choice', icon: 'checkbox', hint: 'Pick any options that apply.' },
  { type: 'NUMBER', label: 'Number', icon: 'calculator', hint: 'A count or amount, with an optional range.' },
  { type: 'RATING', label: 'Rating', icon: 'star', hint: 'A score from 1 to the top of the scale.' },
  { type: 'TEXT', label: 'Text', icon: 'text', hint: 'A free-text note.' },
  { type: 'PHOTO', label: 'Photo', icon: 'camera', hint: 'One or more photos, time- and GPS-stamped.' },
];

export function typeLabel(type: SurveyQuestionType): string {
  return QUESTION_TYPES.find((t) => t.type === type)?.label ?? type;
}

/** Surveys a customer should be asked today: active, in date, and for their price group. */
export function applicableSurveys(surveys: SurveyDefinition[], priceGroup: string, today: string): SurveyDefinition[] {
  return surveys.filter(
    (s) =>
      s.active !== false &&
      s.questions.length > 0 &&
      (!s.validFrom || today >= s.validFrom.slice(0, 10)) &&
      (!s.validTo || today <= s.validTo.slice(0, 10)) &&
      (!s.customerGroups?.length || s.customerGroups.includes(priceGroup))
  );
}

/** The value a condition compares against, as text. */
function asText(v: SurveyValue): string[] {
  if (v === null || v === undefined) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'boolean') return [v ? 'Yes' : 'No'];
  return [String(v)];
}

/**
 * Whether a question is asked, given the answers so far. A question whose
 * condition points at a hidden question is hidden too, so a chain of
 * follow-ups collapses together.
 */
export function isVisible(q: SurveyQuestion, questions: SurveyQuestion[], answers: Record<string, SurveyValue>, depth = 0): boolean {
  if (!q.showIf) return true;
  if (depth > questions.length) return false;
  const parent = questions.find((p) => p.id === q.showIf!.questionId);
  if (!parent || !isVisible(parent, questions, answers, depth + 1)) return false;
  return asText(answers[parent.id] ?? null).includes(q.showIf.equals);
}

export function visibleQuestions(survey: SurveyDefinition, answers: Record<string, SurveyValue>): SurveyQuestion[] {
  return survey.questions.filter((q) => isVisible(q, survey.questions, answers));
}

export function isAnswered(q: SurveyQuestion, value: SurveyValue, photoCount: number): boolean {
  if (q.type === 'PHOTO') return photoCount > 0;
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

/** A problem with an answer that is filled in but not acceptable — a number out of range. */
export function answerError(q: SurveyQuestion, value: SurveyValue): string | null {
  if (q.type !== 'NUMBER' || typeof value !== 'number') return null;
  if (q.min !== undefined && value < q.min) return `At least ${q.min}.`;
  if (q.max !== undefined && value > q.max) return `At most ${q.max}.`;
  return null;
}

export function ratingScale(q: SurveyQuestion): number[] {
  const top = Math.min(10, Math.max(2, q.max ?? 5));
  return Array.from({ length: top }, (_, i) => i + 1);
}

/** Values a condition on this question can match. */
export function conditionValues(q: SurveyQuestion): string[] {
  if (q.type === 'YES_NO') return ['Yes', 'No'];
  if (q.type === 'CHOICE' || q.type === 'MULTI_CHOICE') return (q.options ?? []).filter((o) => o.trim());
  if (q.type === 'RATING') return ratingScale(q).map(String);
  return [];
}

export function newQuestion(type: SurveyQuestionType): SurveyQuestion {
  const q: SurveyQuestion = { id: `q-${uuidV4().slice(0, 8)}`, text: '', type, required: false };
  if (type === 'CHOICE' || type === 'MULTI_CHOICE') q.options = ['', ''];
  if (type === 'RATING') q.max = 5;
  return q;
}

export function newSurvey(): SurveyDefinition {
  return { id: `SV-${uuidV4().slice(0, 6).toUpperCase()}`, name: '', active: true, customerGroups: [], questions: [] };
}

export interface DefinitionCheck {
  ok: boolean;
  survey: string[];
  /** Question id → problems. */
  questions: Record<string, string[]>;
}

/** Whether a definition can be sent to the vans, and what to fix if not. */
export function validateDefinition(def: SurveyDefinition): DefinitionCheck {
  const survey: string[] = [];
  const questions: Record<string, string[]> = {};
  if (!def.name.trim()) survey.push('Give the survey a name.');
  if (!def.questions.length) survey.push('Add at least one question.');
  if (def.validFrom && def.validTo && def.validFrom > def.validTo) survey.push('“Valid until” is before “Valid from”.');

  def.questions.forEach((q, index) => {
    const p: string[] = [];
    if (!q.text.trim()) p.push('Write the question.');
    if (q.type === 'CHOICE' || q.type === 'MULTI_CHOICE') {
      const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) p.push('Give at least two options.');
      if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) p.push('Two options are the same.');
    }
    if (q.type === 'NUMBER' && q.min !== undefined && q.max !== undefined && q.min > q.max) p.push('Minimum is above maximum.');
    if (q.showIf) {
      const parentIndex = def.questions.findIndex((x) => x.id === q.showIf!.questionId);
      if (parentIndex < 0 || parentIndex >= index) p.push('A condition can only depend on an earlier question.');
      else if (!conditionValues(def.questions[parentIndex]).includes(q.showIf.equals)) p.push('Pick the answer that shows this question.');
    }
    if (p.length) questions[q.id] = p;
  });

  return { ok: survey.length === 0 && Object.keys(questions).length === 0, survey, questions };
}
