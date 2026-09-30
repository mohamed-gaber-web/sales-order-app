import { firstValueFrom } from 'rxjs';
import {
  answerError,
  applicableSurveys,
  conditionValues,
  isAnswered,
  newQuestion,
  newSurvey,
  validateDefinition,
  visibleQuestions,
} from './survey-logic';
import { VanSalesMockApi } from './van-sales-mock.api';
import { SurveyDefinition, SurveyQuestion } from './van-sales.models';

const q = (p: Partial<SurveyQuestion> & { id: string }): SurveyQuestion => ({ text: p.id, type: 'YES_NO', required: false, ...p });

const survey: SurveyDefinition = {
  id: 'S',
  name: 'Shelf',
  questions: [
    q({ id: 'onShelf' }),
    q({ id: 'why', type: 'CHOICE', options: ['Out of stock', 'No space'], showIf: { questionId: 'onShelf', equals: 'No' } }),
    q({ id: 'restock', showIf: { questionId: 'why', equals: 'Out of stock' } }),
    q({ id: 'facings', type: 'NUMBER', min: 0, max: 50, showIf: { questionId: 'onShelf', equals: 'Yes' } }),
    q({ id: 'brands', type: 'MULTI_CHOICE', options: ['A', 'B'] }),
    q({ id: 'aboutA', type: 'TEXT', showIf: { questionId: 'brands', equals: 'A' } }),
  ],
};

const ids = (answers: Record<string, unknown>) => visibleQuestions(survey, answers as never).map((x) => x.id);

describe('survey logic — questions come from the definition', () => {
  it('asks only unconditional questions before anything is answered', () => {
    expect(ids({})).toEqual(['onShelf', 'brands']);
  });

  it('shows a follow-up once its answer is given, and chains further follow-ups', () => {
    expect(ids({ onShelf: false })).toEqual(['onShelf', 'why', 'brands']);
    expect(ids({ onShelf: false, why: 'Out of stock' })).toEqual(['onShelf', 'why', 'restock', 'brands']);
    expect(ids({ onShelf: true })).toEqual(['onShelf', 'facings', 'brands']);
  });

  it('hides a whole chain when its root answer changes', () => {
    // "restock" depends on "why", which is hidden once the product is on the shelf.
    expect(ids({ onShelf: true, why: 'Out of stock' })).not.toContain('restock');
  });

  it('matches a multiple-choice condition when the option is one of the picks', () => {
    expect(ids({ brands: ['B', 'A'] })).toContain('aboutA');
    expect(ids({ brands: ['B'] })).not.toContain('aboutA');
  });

  it('knows when an answer is complete, and when a number is out of range', () => {
    expect(isAnswered(q({ id: 'x', type: 'TEXT' }), '   ', 0)).toBeFalse();
    expect(isAnswered(q({ id: 'x', type: 'MULTI_CHOICE' }), [], 0)).toBeFalse();
    expect(isAnswered(q({ id: 'x', type: 'PHOTO' }), null, 1)).toBeTrue();
    expect(isAnswered(q({ id: 'x' }), false, 0)).toBeTrue();
    expect(answerError(survey.questions[3], 60)).toBe('At most 50.');
    expect(answerError(survey.questions[3], 12)).toBeNull();
  });

  it('offers surveys by active flag, dates and price group', () => {
    const list: SurveyDefinition[] = [
      { ...survey, id: 'all' },
      { ...survey, id: 'off', active: false },
      { ...survey, id: 'later', validFrom: '2026-12-01' },
      { ...survey, id: 'keyOnly', customerGroups: ['Key account'] },
      { ...survey, id: 'empty', questions: [] },
    ];
    expect(applicableSurveys(list, 'Retail', '2026-10-01').map((s) => s.id)).toEqual(['all']);
    expect(applicableSurveys(list, 'Key account', '2026-10-01').map((s) => s.id)).toEqual(['all', 'keyOnly']);
  });

  it('offers the right condition answers per type', () => {
    expect(conditionValues(q({ id: 'x' }))).toEqual(['Yes', 'No']);
    expect(conditionValues(q({ id: 'x', type: 'RATING', max: 3 }))).toEqual(['1', '2', '3']);
    expect(conditionValues(q({ id: 'x', type: 'TEXT' }))).toEqual([]);
  });
});

describe('survey logic — builder validation', () => {
  it('refuses an empty survey', () => {
    const check = validateDefinition(newSurvey());
    expect(check.ok).toBeFalse();
    expect(check.survey).toContain('Give the survey a name.');
    expect(check.survey).toContain('Add at least one question.');
  });

  it('accepts the demo-shaped survey', () => {
    expect(validateDefinition(survey).ok).toBeTrue();
  });

  it('flags choice questions without two distinct options', () => {
    const bad = { ...survey, questions: [q({ id: 'c', type: 'CHOICE', options: ['A', 'a'] }), q({ id: 'd', type: 'CHOICE', options: ['A', ''] })] };
    const check = validateDefinition(bad);
    expect(check.questions['c']).toContain('Two options are the same.');
    expect(check.questions['d']).toContain('Give at least two options.');
  });

  it('only allows a condition on an earlier question with a real answer', () => {
    const forward = { ...survey, questions: [q({ id: 'a', showIf: { questionId: 'b', equals: 'Yes' } }), q({ id: 'b' })] };
    expect(validateDefinition(forward).questions['a']).toContain('A condition can only depend on an earlier question.');
    const wrongValue = { ...survey, questions: [q({ id: 'a' }), q({ id: 'b', showIf: { questionId: 'a', equals: 'Maybe' } })] };
    expect(validateDefinition(wrongValue).questions['b']).toContain('Pick the answer that shows this question.');
  });

  it('gives new choice questions two blank options and ratings a 1–5 scale', () => {
    expect(newQuestion('CHOICE').options).toEqual(['', '']);
    expect(newQuestion('RATING').max).toBe(5);
  });
});

describe('mock backend — surveys are editable server state', () => {
  it('saves, updates and deletes a survey, and keeps it across a reload', async () => {
    localStorage.removeItem('gp.vanSales.mockServer');
    const api = new VanSalesMockApi();
    api.resetServer();
    const before = (await firstValueFrom(api.getSurveys())).length;

    await firstValueFrom(api.saveSurvey({ ...survey, id: 'SV-NEW', name: 'New one' }));
    await firstValueFrom(api.saveSurvey({ ...survey, id: 'SV-NEW', name: 'Renamed' }));
    const reloaded = await firstValueFrom(new VanSalesMockApi().getSurveys());
    expect(reloaded.length).toBe(before + 1);
    expect(reloaded.find((s) => s.id === 'SV-NEW')!.name).toBe('Renamed');

    await firstValueFrom(api.deleteSurvey('SV-NEW'));
    expect((await firstValueFrom(api.getSurveys())).length).toBe(before);
  });
});
