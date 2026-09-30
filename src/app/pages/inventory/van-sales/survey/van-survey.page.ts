import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Camera, CameraResultType } from '@capacitor/camera';
import { firstValueFrom } from 'rxjs';
import { DeviceLocationService } from '../../../../core/services/device-location.service';
import { VanDayService } from '../../../../core/services/van-day.service';
import {
  answerError,
  applicableSurveys,
  isAnswered,
  localIsoDate,
  ratingScale,
  SurveyAnswer,
  SurveyDefinition,
  SurveyQuestion,
  SurveyValue,
  visibleQuestions,
  VanStoreService,
  VanTransactionsService,
} from '../../../../core/van-sales';

interface SurveyPhoto {
  dataUrl: string;
  takenAt: string;
}

/** Max photos per question — each one is an upload on a field connection. */
const MAX_PHOTOS = 6;

/**
 * A merchandising survey for the current customer (spec §7.6, F11).
 *
 * Nothing here is fixed: the surveys, their questions, types, options and the
 * conditions that show a question all come from the definitions a supervisor
 * builds in the survey builder (API #15). A question with a condition appears
 * only once the answer it depends on is given, and answers to questions that
 * end up hidden are not sent.
 */
@Component({
  selector: 'app-van-survey',
  templateUrl: './van-survey.page.html',
  styleUrls: ['./van-survey.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanSurveyPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private readonly location = inject(DeviceLocationService);
  private readonly tx = inject(VanTransactionsService);
  private readonly day = inject(VanDayService);
  readonly store = inject(VanStoreService);

  readonly maxPhotos = MAX_PHOTOS;
  readonly ratingScale = ratingScale;
  readonly visit = this.day.currentVisit;
  readonly customer = computed(() => {
    const v = this.visit();
    return v ? (this.store.customer(v.account) ?? null) : null;
  });

  /** Every survey this customer should be asked today. */
  readonly surveys = computed<SurveyDefinition[]>(() => {
    const c = this.customer();
    return c ? applicableSurveys(this.store.surveys(), c.priceGroup, localIsoDate()) : [];
  });

  private readonly chosenId = signal<string | null>(null);

  readonly survey = computed<SurveyDefinition | null>(() => {
    const list = this.surveys();
    return list.find((s) => s.id === this.chosenId()) ?? list[0] ?? null;
  });

  readonly surveyedToday = computed(() => {
    const c = this.customer();
    return !!c && this.store.local().surveyed.includes(c.id);
  });

  readonly answers = signal<Record<string, SurveyValue>>({});
  readonly photos = signal<Record<string, SurveyPhoto[]>>({});
  readonly saving = signal(false);
  readonly capturing = signal<string | null>(null);

  /** The questions asked right now, given the answers so far. */
  readonly questions = computed(() => {
    const s = this.survey();
    return s ? visibleQuestions(s, this.answers()) : [];
  });

  readonly missing = computed(
    () => new Set(this.questions().filter((q) => q.required && !isAnswered(q, this.value(q), this.photosOf(q).length)).map((q) => q.id))
  );

  readonly invalid = computed(() => new Set(this.questions().filter((q) => !!answerError(q, this.value(q))).map((q) => q.id)));

  readonly progress = computed(() => {
    const qs = this.questions();
    const done = qs.filter((q) => isAnswered(q, this.value(q), this.photosOf(q).length)).length;
    return { done, total: qs.length, ratio: qs.length ? done / qs.length : 0 };
  });

  readonly canSave = computed(
    () =>
      !!this.survey() &&
      !!this.customer() &&
      this.missing().size === 0 &&
      this.invalid().size === 0 &&
      !this.saving() &&
      !this.store.dayClosed()
  );

  async ngOnInit(): Promise<void> {
    if (!this.visit()) {
      const id = Number(this.route.snapshot.paramMap.get('id'));
      if (Number.isFinite(id)) this.day.setCurrentVisit(id);
    }
    if (!this.visit()) {
      this.router.navigate(['/inventory/van-sales']);
      return;
    }
    await this.store.ensureLoaded();
    // Pick up definitions edited since the last pull; the cached ones stand offline.
    this.store.reloadSurveys().catch(() => undefined);
  }

  choose(id: string): void {
    if (id === this.survey()?.id) return;
    this.chosenId.set(id);
    this.answers.set({});
    this.photos.set({});
  }

  value(q: SurveyQuestion): SurveyValue {
    return this.answers()[q.id] ?? null;
  }

  error(q: SurveyQuestion): string | null {
    return answerError(q, this.value(q));
  }

  photosOf(q: SurveyQuestion): SurveyPhoto[] {
    return this.photos()[q.id] ?? [];
  }

  isAnswered(q: SurveyQuestion): boolean {
    return isAnswered(q, this.value(q), this.photosOf(q).length);
  }

  setAnswer(q: SurveyQuestion, value: SurveyValue): void {
    this.answers.update((a) => ({ ...a, [q.id]: value }));
  }

  ratingOf(q: SurveyQuestion): number {
    const v = this.value(q);
    return typeof v === 'number' ? v : 0;
  }

  isPicked(q: SurveyQuestion, option: string): boolean {
    const v = this.value(q);
    return Array.isArray(v) && v.includes(option);
  }

  togglePick(q: SurveyQuestion, option: string): void {
    const v = this.value(q);
    const list = Array.isArray(v) ? v : [];
    this.setAnswer(q, list.includes(option) ? list.filter((o) => o !== option) : [...list, option]);
  }

  onNumber(q: SurveyQuestion, raw: string): void {
    const text = String(raw).trim().replace(',', '.');
    const n = text === '' ? NaN : Number(text);
    this.setAnswer(q, Number.isFinite(n) ? n : null);
  }

  numberHint(q: SurveyQuestion): string {
    if (q.min !== undefined && q.max !== undefined) return `${q.min}–${q.max}`;
    if (q.min !== undefined) return `${q.min} or more`;
    if (q.max !== undefined) return `Up to ${q.max}`;
    return '';
  }

  async addPhoto(q: SurveyQuestion): Promise<void> {
    if (this.photosOf(q).length >= MAX_PHOTOS || this.capturing()) return;
    this.capturing.set(q.id);
    try {
      const photo = await Camera.getPhoto({ resultType: CameraResultType.DataUrl, quality: 60 });
      if (photo.dataUrl) {
        const entry: SurveyPhoto = { dataUrl: photo.dataUrl, takenAt: new Date().toISOString() };
        this.photos.update((p) => ({ ...p, [q.id]: [...(p[q.id] ?? []), entry] }));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(message)) await this.toast('Could not take the photo. Check camera permission.', 'danger');
    } finally {
      this.capturing.set(null);
    }
  }

  removePhoto(q: SurveyQuestion, index: number): void {
    this.photos.update((p) => ({ ...p, [q.id]: (p[q.id] ?? []).filter((_, i) => i !== index) }));
  }

  time(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async save(): Promise<void> {
    const survey = this.survey();
    const customer = this.customer();
    const v = this.visit();
    if (!survey || !customer || !v || !this.canSave()) return;
    this.saving.set(true);
    try {
      const resubmit = this.surveyedToday();
      const position = await firstValueFrom(this.location.getCurrent()).catch(() => null);
      // Only what was asked: answers left on questions that are now hidden are dropped.
      const asked = this.questions();
      const answers: SurveyAnswer[] = asked.map((q) => ({
        questionId: q.id,
        value: q.type === 'PHOTO' ? this.photosOf(q).length || null : this.value(q),
      }));
      const photos = asked
        .filter((q) => q.type === 'PHOTO')
        .reduce<{ questionId: string; dataUrl: string; takenAt: string }[]>(
          (all, q) => all.concat(this.photosOf(q).map((p) => ({ questionId: q.id, dataUrl: p.dataUrl, takenAt: p.takenAt }))),
          []
        );
      await this.tx.submitSurvey(customer.id, survey, answers, photos, position);
      await this.toast(resubmit ? 'Survey resubmitted' : 'Survey saved', 'success');
      this.router.navigate(['/inventory/van-sales/visit', v.id], { replaceUrl: true });
    } catch (e) {
      await this.toast(e instanceof Error ? e.message : 'Could not save the survey.', 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  back(): void {
    const v = this.visit();
    this.router.navigate(v ? ['/inventory/van-sales/visit', v.id] : ['/inventory/van-sales']);
  }

  private async toast(message: string, color: 'success' | 'danger'): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 1800, position: 'top', color });
    await t.present();
  }
}
