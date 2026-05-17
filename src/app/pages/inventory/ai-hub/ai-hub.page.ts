import { Component, OnDestroy, OnInit } from '@angular/core';
import { ModalController, ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { AI_HUB_DATA, AiCategory, AiFeature, TAG_LABELS, TagCode } from './ai-hub.data';

type FilterChip = TagCode | 'all';

@Component({
  selector: 'app-ai-hub',
  templateUrl: './ai-hub.page.html',
  styleUrls: ['./ai-hub.page.scss'],
  standalone: false,
})
export class AiHubPage implements OnInit, OnDestroy {

  // ── State ────────────────────────────────────────────────────────
  searchQuery = '';
  activeFilter: FilterChip = 'all';
  openIds = new Set<string>(['recognition']); // first category open by default
  selectedFeature: AiFeature | null = null;
  selectedCategory: AiCategory | null = null;
  currentTime = '';

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  private clockInterval: ReturnType<typeof setInterval> | null = null;

  // ── Static data ──────────────────────────────────────────────────
  readonly allCategories: AiCategory[] = AI_HUB_DATA;
  readonly totalFeatureCount = AI_HUB_DATA.reduce((s, c) => s + c.features.length, 0);

  readonly chips: { label: string; value: FilterChip }[] = [
    { label: 'All',           value: 'all'    },
    { label: 'Vision (CV)',   value: 'CV'     },
    { label: 'OCR',           value: 'OCR'    },
    { label: 'Voice / NLP',   value: 'NLP'    },
    { label: 'Predictive',    value: 'ML'     },
    { label: 'Optimization',  value: 'OPT'    },
    { label: 'Detection',     value: 'DETECT' },
    { label: 'AR',            value: 'AR'     },
  ];

  constructor(
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
  ) {}

  ngOnInit() {
    this.updateClock();
    this.clockInterval = setInterval(() => this.updateClock(), 60_000);

    this.searchSubject.pipe(
      debounceTime(150),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe(q => {
      this.searchQuery = q;
      this.autoOpenMatching();
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.clockInterval !== null) clearInterval(this.clockInterval);
  }

  // ── Computed getters ─────────────────────────────────────────────
  get visibleCategories(): AiCategory[] {
    return this.allCategories
      .map(cat => ({ ...cat, features: this.filterFeatures(cat.features) }))
      .filter(cat => cat.features.length > 0);
  }

  get visibleCount(): number {
    return this.visibleCategories.reduce((s, c) => s + c.features.length, 0);
  }

  // ── Interactions ─────────────────────────────────────────────────
  onSearchInput(event: Event) {
    const val = (event as CustomEvent).detail?.value ?? (event.target as HTMLInputElement).value;
    this.searchSubject.next(val ?? '');
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchSubject.next('');
  }

  selectFilter(chip: FilterChip) {
    this.activeFilter = chip;
    this.autoOpenMatching();
  }

  toggleCategory(id: string) {
    if (this.openIds.has(id)) {
      this.openIds.delete(id);
    } else {
      this.openIds.add(id);
    }
  }

  isCategoryOpen(id: string): boolean {
    return this.openIds.has(id);
  }

  async openFeature(feature: AiFeature, category: AiCategory) {
    this.selectedFeature = feature;
    this.selectedCategory = category;
  }

  closeFeature() {
    this.selectedFeature = null;
    this.selectedCategory = null;
  }

  async requestFeature() {
    if (!this.selectedFeature) return;
    const toast = await this.toastCtrl.create({
      message: 'Logged. Thank you for the suggestion.',
      duration: 3000,
      color: 'success',
      position: 'bottom',
    });
    await toast.present();
  }

  learnMore() {
    // Stub — wire to documentation or external link later
    console.log('Learn more:', this.selectedFeature?.title);
  }

  // ── Helpers ──────────────────────────────────────────────────────
  tagLabel(tag: TagCode): string {
    return TAG_LABELS[tag];
  }

  padNumber(n: number): string {
    return n.toString().padStart(2, '0');
  }

  trackById(index: number, cat: AiCategory): string { return cat.id; }
  trackByNumber(index: number, f: AiFeature): number { return f.number; }

  private filterFeatures(features: AiFeature[]): AiFeature[] {
    return features.filter(f => {
      const tagOk = this.activeFilter === 'all' || f.tag === this.activeFilter;
      if (!tagOk) return false;
      if (!this.searchQuery.trim()) return true;
      const q = this.searchQuery.toLowerCase();
      return f.title.toLowerCase().includes(q) || f.description.toLowerCase().includes(q);
    });
  }

  private autoOpenMatching() {
    const isFiltering = this.searchQuery.trim() || this.activeFilter !== 'all';
    if (!isFiltering) return;
    this.openIds.clear();
    this.allCategories.forEach(cat => {
      if (this.filterFeatures(cat.features).length > 0) {
        this.openIds.add(cat.id);
      }
    });
  }

  private updateClock() {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
}
