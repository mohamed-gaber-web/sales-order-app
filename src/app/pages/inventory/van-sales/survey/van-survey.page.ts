import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Camera, CameraResultType } from '@capacitor/camera';
import { firstValueFrom } from 'rxjs';
import { DeviceLocationService } from '../../../../core/services/device-location.service';
import { VanDayService } from '../../../../core/services/van-day.service';
import {
  SurveyAnswer,
  SurveyQuestion,
  VanStoreService,
  VanTransactionsService,
} from '../../../../core/van-sales';

type AnswerValue = string | number | boolean | null;

interface SurveyPhoto {
  dataUrl: string;
  takenAt: string;
}

/** Max photos per question — each one is an upload on a field connection. */
const MAX_PHOTOS = 6;

/**
 * Merchandising survey for the current customer (spec §7.6, F11). Questions
 * come from API #15; the definition is the first one open to the customer's
 * price group. Photos are time-stamped here; the foundation adds GPS.
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
  readonly visit = this.day.currentVisit;
  readonly customer = computed(() => {
    const v = this.visit();
    return v ? (this.store.customer(v.account) ?? null) : null;
  });

  readonly survey = computed(() => {
    const c = this.customer();
    if (!c) return null;
    return (
      this.store.surveys().find((s) => !s.customerGroups?.length || s.customerGroups.includes(c.priceGroup)) ?? null
    );
  });

  readonly surveyedToday = computed(() => {
    const c = this.customer();
    return !!c && this.store.local().surveyed.includes(c.id);
  });

  readonly answers = signal<Record<string, AnswerValue>>({});
  readonly photos = signal<Record<string, SurveyPhoto[]>>({});
  readonly saving = signal(false);
  readonly capturing = signal<string | null>(null);

  readonly missing = computed(() => {
    const s = this.survey();
    if (!s) return new Set<string>();
    return new Set(s.questions.filter((q) => q.required && !this.isAnswered(q)).map((q) => q.id));
  });

  readonly canSave = computed(
    () => !!this.survey() && !!this.customer() && this.missing().size === 0 && !this.saving() && !this.store.dayClosed()
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
  }

  value(q: SurveyQuestion): AnswerValue {
    return this.answers()[q.id] ?? null;
  }

  photosOf(q: SurveyQuestion): SurveyPhoto[] {
    return this.photos()[q.id] ?? [];
  }

  setAnswer(q: SurveyQuestion, value: AnswerValue): void {
    this.answers.update((a) => ({ ...a, [q.id]: value }));
  }

  onNumber(q: SurveyQuestion, raw: string): void {
    const text = String(raw).trim().replace(',', '.');
    const n = text === '' ? NaN : Number(text);
    this.setAnswer(q, Number.isFinite(n) ? n : null);
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
      const answers: SurveyAnswer[] = survey.questions.map((q) => ({
        questionId: q.id,
        value: q.type === 'PHOTO' ? this.photosOf(q).length || null : this.value(q),
      }));
      const photos = survey.questions.flatMap((q) =>
        this.photosOf(q).map((p) => ({ questionId: q.id, dataUrl: p.dataUrl, takenAt: p.takenAt }))
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

  private isAnswered(q: SurveyQuestion): boolean {
    if (q.type === 'PHOTO') return this.photosOf(q).length > 0;
    const v = this.answers()[q.id];
    if (v === null || v === undefined) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    return true;
  }

  private async toast(message: string, color: 'success' | 'danger'): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 1800, position: 'top', color });
    await t.present();
  }
}
