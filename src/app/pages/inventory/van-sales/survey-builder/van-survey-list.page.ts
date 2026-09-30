import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { localIsoDate, NetworkStatusService, SurveyDefinition, uuidV4, VanStoreService } from '../../../../core/van-sales';

/**
 * Survey builder — the list. Every survey the vans can be asked to run, with
 * whether it is live today, who it is for, and how many questions it has.
 */
@Component({
  selector: 'app-van-survey-list',
  templateUrl: './van-survey-list.page.html',
  styleUrls: ['./van-survey-builder.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanSurveyListPage {
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  readonly store = inject(VanStoreService);
  readonly network = inject(NetworkStatusService);

  readonly loading = signal(false);

  readonly rows = computed(() => {
    const today = localIsoDate();
    return [...this.store.surveys()]
      .map((s) => ({ survey: s, status: status(s, today) }))
      .sort((a, b) => a.survey.name.localeCompare(b.survey.name));
  });

  async ionViewWillEnter(): Promise<void> {
    this.loading.set(true);
    try {
      await this.store.reloadSurveys();
    } catch {
      // Offline — the cached list stands.
    } finally {
      this.loading.set(false);
    }
  }

  open(s: SurveyDefinition): void {
    this.router.navigate(['/inventory/van-sales/surveys', s.id]);
  }

  create(): void {
    this.router.navigate(['/inventory/van-sales/surveys', 'new']);
  }

  async duplicate(s: SurveyDefinition, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (!this.network.online()) {
      void this.toast('Go online to copy a survey.');
      return;
    }
    const copy: SurveyDefinition = {
      ...structuredClone(s),
      id: `SV-${uuidV4().slice(0, 6).toUpperCase()}`,
      name: `${s.name} (copy)`,
      active: false,
    };
    try {
      await this.store.saveSurvey(copy);
      this.router.navigate(['/inventory/van-sales/surveys', copy.id]);
    } catch {
      void this.toast("Couldn't copy the survey.");
    }
  }

  groups(s: SurveyDefinition): string {
    return s.customerGroups?.length ? s.customerGroups.join(', ') : 'All customers';
  }

  private async toast(message: string): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 2000, position: 'top', color: 'medium' });
    await t.present();
  }
}

export type SurveyStatus = { label: string; tone: 'live' | 'off' | 'scheduled' | 'ended' };

export function status(s: SurveyDefinition, today: string): SurveyStatus {
  if (s.active === false) return { label: 'Inactive', tone: 'off' };
  if (s.validFrom && today < s.validFrom.slice(0, 10)) return { label: `Starts ${s.validFrom.slice(0, 10)}`, tone: 'scheduled' };
  if (s.validTo && today > s.validTo.slice(0, 10)) return { label: 'Ended', tone: 'ended' };
  return { label: 'Live', tone: 'live' };
}
