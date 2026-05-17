import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { CycleCountService } from '../../../../core/services/cycle-count.service';
import { CycleCountJournalLine } from '../../../../models/inventory.model';

interface CountEntry {
  line: CycleCountJournalLine;
  countedQty: number;
  isSaving: boolean;
  isSaved: boolean;
  isModified: boolean;
}

@Component({
  selector: 'app-cycle-count-form',
  templateUrl: './cycle-count-form.page.html',
  styleUrls: ['./cycle-count-form.page.scss'],
  standalone: false,
})
export class CycleCountFormPage implements OnInit {
  journalNumber = '';
  entries: CountEntry[] = [];
  isLoading = false;
  loadError = false;
  readonly Math = Math;

  get savedCount(): number { return this.entries.filter(e => e.isSaved).length; }
  get totalCount(): number { return this.entries.length; }

  private get storageKey(): string { return `cc_saved_${this.journalNumber}`; }

  private getSavedSet(): Set<number> {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
    } catch { return new Set(); }
  }

  private persistSaved(lineNumber: number) {
    const saved = this.getSavedSet();
    saved.add(lineNumber);
    localStorage.setItem(this.storageKey, JSON.stringify([...saved]));
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private toastCtrl: ToastController,
    private cycleCountService: CycleCountService,
  ) {}

  ngOnInit() {
    this.journalNumber = this.route.snapshot.paramMap.get('journalNumber') ?? '';
    this.loadLines();
  }

  loadLines() {
    if (!this.journalNumber) return;
    this.isLoading = true;
    this.loadError = false;
    this.entries = [];

    this.cycleCountService.getJournalLines(this.journalNumber).subscribe({
      next: (res) => {
        const savedSet = this.getSavedSet();
        this.entries = res.value.map(line => ({
          line,
          countedQty: line.CountedQuantity ?? 0,
          isSaving: false,
          isSaved: savedSet.has(line.LineNumber),
          isModified: false,
        }));
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        this.loadError = true;
        const toast = await this.toastCtrl.create({
          message: 'Could not load journal lines. Check your connection.',
          duration: 3000, color: 'danger', position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  doRefresh(event: CustomEvent) {
    this.cycleCountService.getJournalLines(this.journalNumber).subscribe({
      next: (res) => {
        const savedSet = this.getSavedSet();
        this.entries = res.value.map(line => ({
          line,
          countedQty: line.CountedQuantity ?? 0,
          isSaving: false,
          isSaved: savedSet.has(line.LineNumber),
          isModified: false,
        }));
        (event.target as HTMLIonRefresherElement).complete();
      },
      error: async () => {
        (event.target as HTMLIonRefresherElement).complete();
        const toast = await this.toastCtrl.create({
          message: 'Refresh failed.', duration: 2500, color: 'danger', position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  onQtyChange(entry: CountEntry) {
    entry.isModified = true;
    entry.isSaved = false;
  }

  decrement(entry: CountEntry) {
    entry.countedQty = Math.max(0, entry.countedQty - 1);
    entry.isModified = true;
    entry.isSaved = false;
  }

  increment(entry: CountEntry) {
    entry.countedQty = entry.countedQty + 1;
    entry.isModified = true;
    entry.isSaved = false;
  }

  saveLine(entry: CountEntry) {
    if (entry.isSaving) return;
    entry.isSaving = true;

    this.cycleCountService.updateCountedQuantity(
      entry.line.dataAreaId,
      this.journalNumber,
      entry.line.LineNumber,
      entry.countedQty,
    ).subscribe({
      next: async () => {
        entry.isSaving = false;
        entry.isSaved = true;
        entry.isModified = false;
        entry.line.CountedQuantity = entry.countedQty;
        this.persistSaved(entry.line.LineNumber);
        const toast = await this.toastCtrl.create({
          message: `Line ${entry.line.LineNumber} saved.`,
          duration: 2000, color: 'success', position: 'bottom',
        });
        await toast.present();
      },
      error: async (err: unknown) => {
        entry.isSaving = false;
        const e = err as { error?: { Message?: string; message?: string }; message?: string };
        const msg = e?.error?.Message ?? e?.error?.message ?? e?.message ?? 'Save failed. Try again.';
        const toast = await this.toastCtrl.create({
          message: msg, duration: 4000, color: 'danger', position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  goBack() { this.router.navigate(['/inventory/cycle-count']); }
}
