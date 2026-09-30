import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import {
  conditionValues,
  isAnswered,
  isVisible,
  NetworkStatusService,
  newQuestion,
  newSurvey,
  QUESTION_TYPES,
  SurveyDefinition,
  SurveyQuestion,
  SurveyQuestionType,
  SurveyValue,
  typeLabel,
  validateDefinition,
  VanStoreService,
} from '../../../../core/van-sales';

/**
 * Survey builder — the editor. A supervisor designs a survey here: its
 * audience and dates, then each question — wording, type, whether it must be
 * answered, its options or range, and an optional condition that asks it only
 * after a given answer to an earlier question. The preview runs the same
 * rules the field screen does, so what you try here is what a rep will see.
 */
@Component({
  selector: 'app-van-survey-editor',
  templateUrl: './van-survey-editor.page.html',
  styleUrls: ['./van-survey-builder.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanSurveyEditorPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);
  readonly store = inject(VanStoreService);
  readonly network = inject(NetworkStatusService);

  readonly types = QUESTION_TYPES;
  readonly typeLabel = typeLabel;
  readonly conditionValues = conditionValues;

  readonly draft = signal<SurveyDefinition>(newSurvey());
  readonly isNew = signal(true);
  readonly dirty = signal(false);
  readonly saving = signal(false);
  /** Which question card is open for editing. */
  readonly openId = signal<string | null>(null);
  readonly addingType = signal(false);
  readonly mode = signal<'edit' | 'preview'>('edit');
  readonly previewAnswers = signal<Record<string, SurveyValue>>({});

  readonly check = computed(() => validateDefinition(this.draft()));

  /** Problems left before the survey can be saved. */
  readonly issueCount = computed(() => this.check().survey.length + Object.keys(this.check().questions).length);

  readonly saveLabel = computed(() => {
    const n = this.issueCount();
    if (n) return `Fix ${n} ${n === 1 ? 'item' : 'items'} to save`;
    return this.isNew() ? 'Create survey' : 'Save changes';
  });

  /** Price groups on the route, for the audience chips. */
  readonly priceGroups = computed(() => {
    const fromCustomers = this.store.customers().map((c) => c.priceGroup);
    const chosen = this.draft().customerGroups ?? [];
    return [...new Set([...fromCustomers, ...chosen])].filter(Boolean).sort();
  });

  readonly previewQuestions = computed(() => this.draft().questions.filter((q) => isVisible(q, this.draft().questions, this.previewAnswers())));

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      const found = this.store.surveys().find((s) => s.id === id);
      if (found) {
        this.draft.set(structuredClone(found));
        this.isNew.set(false);
      } else {
        void this.toast('That survey no longer exists.');
        this.router.navigate(['/inventory/van-sales/surveys'], { replaceUrl: true });
      }
    }
  }

  // ── Survey-level fields ──────────────────────────────────────────────────

  patch(p: Partial<SurveyDefinition>): void {
    this.draft.update((d) => ({ ...d, ...p }));
    this.dirty.set(true);
  }

  toggleGroup(group: string): void {
    const cur = this.draft().customerGroups ?? [];
    this.patch({ customerGroups: cur.includes(group) ? cur.filter((g) => g !== group) : [...cur, group] });
  }

  // ── Questions ────────────────────────────────────────────────────────────

  addQuestion(type: SurveyQuestionType): void {
    const q = newQuestion(type);
    this.patch({ questions: [...this.draft().questions, q] });
    this.openId.set(q.id);
    this.addingType.set(false);
  }

  update(id: string, p: Partial<SurveyQuestion>): void {
    this.patch({ questions: this.draft().questions.map((q) => (q.id === id ? { ...q, ...p } : q)) });
  }

  changeType(q: SurveyQuestion, type: SurveyQuestionType): void {
    const fresh = newQuestion(type);
    // Keep the wording and settings that still make sense for the new type.
    this.update(q.id, {
      type,
      options: type === 'CHOICE' || type === 'MULTI_CHOICE' ? (q.options?.length ? q.options : fresh.options) : undefined,
      min: type === 'NUMBER' ? q.min : undefined,
      max: type === 'NUMBER' ? q.max : type === 'RATING' ? (q.max ?? 5) : undefined,
    });
    this.dropConditionsOn(q.id);
  }

  setNumber(id: string, field: 'min' | 'max', raw: string): void {
    const t = String(raw).trim();
    const n = t === '' ? undefined : Number(t);
    this.update(id, { [field]: n !== undefined && Number.isFinite(n) ? n : undefined });
  }

  setOption(q: SurveyQuestion, index: number, text: string): void {
    const before = q.options?.[index];
    const options = (q.options ?? []).map((o, i) => (i === index ? text : o));
    this.update(q.id, { options });
    // A condition pointing at the renamed option follows it.
    if (before) this.renameConditionValue(q.id, before, text);
  }

  addOption(q: SurveyQuestion): void {
    this.update(q.id, { options: [...(q.options ?? []), ''] });
  }

  removeOption(q: SurveyQuestion, index: number): void {
    const removed = q.options?.[index];
    this.update(q.id, { options: (q.options ?? []).filter((_, i) => i !== index) });
    if (removed) this.dropConditionsOn(q.id, removed);
  }

  /** Earlier questions a condition can depend on. */
  parentsFor(q: SurveyQuestion): SurveyQuestion[] {
    const qs = this.draft().questions;
    return qs.slice(0, qs.findIndex((x) => x.id === q.id)).filter((p) => conditionValues(p).length > 0);
  }

  setConditionParent(q: SurveyQuestion, parentId: string): void {
    if (!parentId) {
      this.update(q.id, { showIf: undefined });
      return;
    }
    const parent = this.draft().questions.find((p) => p.id === parentId);
    this.update(q.id, { showIf: { questionId: parentId, equals: parent ? conditionValues(parent)[0] ?? '' : '' } });
  }

  setConditionValue(q: SurveyQuestion, equals: string): void {
    if (q.showIf) this.update(q.id, { showIf: { ...q.showIf, equals } });
  }

  conditionText(q: SurveyQuestion): string {
    if (!q.showIf) return '';
    const qs = this.draft().questions;
    const i = qs.findIndex((p) => p.id === q.showIf!.questionId);
    return i < 0 ? 'Condition points at a deleted question' : `Asked when Q${i + 1} is “${q.showIf.equals}”`;
  }

  move(q: SurveyQuestion, dir: -1 | 1): void {
    const qs = [...this.draft().questions];
    const i = qs.findIndex((x) => x.id === q.id);
    const j = i + dir;
    if (j < 0 || j >= qs.length) return;
    [qs[i], qs[j]] = [qs[j], qs[i]];
    this.patch({ questions: qs });
  }

  duplicateQuestion(q: SurveyQuestion): void {
    const copy = { ...structuredClone(q), id: newQuestion(q.type).id, text: `${q.text} (copy)` };
    const qs = [...this.draft().questions];
    qs.splice(qs.findIndex((x) => x.id === q.id) + 1, 0, copy);
    this.patch({ questions: qs });
    this.openId.set(copy.id);
  }

  async removeQuestion(q: SurveyQuestion): Promise<void> {
    const dependants = this.draft().questions.filter((x) => x.showIf?.questionId === q.id).length;
    const alert = await this.alertCtrl.create({
      header: 'Delete this question?',
      message: dependants ? `${dependants} follow-up question(s) depend on it and will always be asked instead.` : undefined,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => {
            this.patch({
              questions: this.draft()
                .questions.filter((x) => x.id !== q.id)
                .map((x) => (x.showIf?.questionId === q.id ? { ...x, showIf: undefined } : x)),
            });
          },
        },
      ],
    });
    await alert.present();
  }

  toggleOpen(id: string): void {
    this.openId.set(this.openId() === id ? null : id);
  }

  problems(q: SurveyQuestion): string[] {
    return this.check().questions[q.id] ?? [];
  }

  // ── Preview ──────────────────────────────────────────────────────────────

  setMode(mode: 'edit' | 'preview'): void {
    this.mode.set(mode);
    if (mode === 'preview') this.previewAnswers.set({});
  }

  answerPreview(q: SurveyQuestion, value: SurveyValue): void {
    this.previewAnswers.update((a) => ({ ...a, [q.id]: a[q.id] === value ? null : value }));
  }

  togglePreviewPick(q: SurveyQuestion, option: string): void {
    const v = this.previewAnswers()[q.id];
    const list = Array.isArray(v) ? v : [];
    this.previewAnswers.update((a) => ({ ...a, [q.id]: list.includes(option) ? list.filter((o) => o !== option) : [...list, option] }));
  }

  previewValue(q: SurveyQuestion): SurveyValue {
    return this.previewAnswers()[q.id] ?? null;
  }

  previewPicked(q: SurveyQuestion, option: string): boolean {
    const v = this.previewValue(q);
    return Array.isArray(v) ? v.includes(option) : v === option;
  }

  previewAnswered(q: SurveyQuestion): boolean {
    return isAnswered(q, this.previewValue(q), 0);
  }

  // ── Save & delete ────────────────────────────────────────────────────────

  async save(): Promise<void> {
    if (!this.check().ok || this.saving()) return;
    if (!this.network.online()) {
      void this.toast('Go online to save — every van needs the same version of the survey.');
      return;
    }
    this.saving.set(true);
    try {
      const clean: SurveyDefinition = {
        ...this.draft(),
        name: this.draft().name.trim(),
        questions: this.draft().questions.map((q) => ({
          ...q,
          text: q.text.trim(),
          help: q.help?.trim() || undefined,
          options: q.options?.map((o) => o.trim()).filter(Boolean),
        })),
      };
      await this.store.saveSurvey(clean);
      this.dirty.set(false);
      void this.toast(this.isNew() ? 'Survey created — vans get it on their next refresh.' : 'Survey saved.');
      this.router.navigate(['/inventory/van-sales/surveys'], { replaceUrl: true });
    } catch {
      void this.toast("Couldn't save the survey. Try again.");
    } finally {
      this.saving.set(false);
    }
  }

  async remove(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Delete this survey?',
      message: 'Reps will no longer be asked it. Answers already sent are kept in D365.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            try {
              await this.store.deleteSurvey(this.draft().id);
              this.router.navigate(['/inventory/van-sales/surveys'], { replaceUrl: true });
            } catch {
              void this.toast("Couldn't delete the survey.");
            }
          },
        },
      ],
    });
    await alert.present();
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /** Clears conditions on `parentId` — all of them, or only those matching `value`. */
  private dropConditionsOn(parentId: string, value?: string): void {
    this.patch({
      questions: this.draft().questions.map((x) =>
        x.showIf?.questionId === parentId && (value === undefined || x.showIf.equals === value) ? { ...x, showIf: undefined } : x
      ),
    });
  }

  private renameConditionValue(parentId: string, from: string, to: string): void {
    this.patch({
      questions: this.draft().questions.map((x) =>
        x.showIf?.questionId === parentId && x.showIf.equals === from ? { ...x, showIf: { ...x.showIf, equals: to } } : x
      ),
    });
  }

  private async toast(message: string): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 2400, position: 'top', color: 'medium' });
    await t.present();
  }
}
