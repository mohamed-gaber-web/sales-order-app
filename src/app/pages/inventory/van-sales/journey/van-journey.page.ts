import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { VanDayService } from '../../../../core/services/van-day.service';
import { VanJourneyService } from '../../../../core/services/van-journey.service';
import { VanVisit } from '../../../../models/van-journey.model';

/**
 * The driver's home for the day: the ordered route of customer stops, the day's
 * running numbers, and the way into every visit. This is the module's landing
 * page — the entry point the app menu links to.
 */
@Component({
  selector: 'app-van-journey',
  templateUrl: './van-journey.page.html',
  styleUrls: ['./van-journey.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanJourneyPage implements OnInit {
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private journey = inject(VanJourneyService);
  readonly day = inject(VanDayService);

  ngOnInit() {
    if (!this.day.isLoaded()) this.seedDay();
  }

  private seedDay() {
    this.journey.loadToday().subscribe((day) => this.day.loadIfEmpty(day));
  }

  handleRefresh(event: CustomEvent) {
    const complete = () => (event.target as HTMLIonRefresherElement).complete();
    this.journey.loadToday().subscribe({
      next: (day) => {
        this.day.reset(day);
        complete();
      },
      error: complete,
    });
  }

  openVisit(visit: VanVisit) {
    if (visit.status === 'done') {
      this.toast(`${visit.name} — ${visit.outcome}`);
      return;
    }
    this.day.setCurrentVisit(visit.id);
    this.router.navigate(['/inventory/van-sales/visit', visit.id]);
  }

  newCustomer() {
    this.router.navigate(['/inventory/van-sales/new-customer']);
  }

  dayClose() {
    this.router.navigate(['/inventory/van-sales/day-close']);
  }

  // ── Presentation helpers ───────────────────────────────────────────────────

  /** Pin colour on the schematic map: done, current, or upcoming. */
  pinColor(visit: VanVisit): string {
    if (visit.status === 'done') return 'var(--ion-color-success, #0e9f6e)';
    if (visit.status === 'current') return 'var(--gp-navy)';
    return '#94a6c8';
  }

  statusPill(visit: VanVisit): { label: string; color: string; bg: string } | null {
    if (visit.status === 'done') {
      return { label: visit.outcome ?? 'Done', color: '#0e6f4e', bg: '#e3f5ec' };
    }
    if (visit.status === 'current') {
      return { label: 'Current', color: '#1a3b6a', bg: '#e6eefb' };
    }
    if (visit.priority) {
      return { label: 'High priority', color: '#9a6a00', bg: '#fdf3d7' };
    }
    if (visit.mode === 'cod') {
      return { label: 'COD', color: '#4b5563', bg: '#eef0f3' };
    }
    return null;
  }

  subtitle(visit: VanVisit): string {
    if (visit.status === 'done') return visit.outcome ?? '';
    if (visit.status === 'current') {
      return `ETA ${visit.eta} · window ${visit.window || '—'} · balance ${this.round(visit.balance)}`;
    }
    return `ETA ${visit.eta}`;
  }

  private round(n: number): string {
    return Math.round(n).toLocaleString('en-US');
  }

  private async toast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 1600,
      position: 'top',
      color: 'medium',
    });
    await toast.present();
  }
}
