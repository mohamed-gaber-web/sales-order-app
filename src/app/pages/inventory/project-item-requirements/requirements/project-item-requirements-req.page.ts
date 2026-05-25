import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import {
  ProjectItemRequirementsService,
  PIRItemRequirement,
  PickingListRequest
} from '../../../../core/services/project-item-requirements.service';

type StatusFilter = 'all' | 'backorder' | 'partial' | 'closed';

interface SelectedLine {
  req: PIRItemRequirement;
  qty: number;
}

@Component({
  selector: 'app-pir-requirements',
  templateUrl: './project-item-requirements-req.page.html',
  styleUrls: ['./project-item-requirements-req.page.scss'],
  standalone: false,
})
export class ProjectItemRequirementsReqPage implements OnInit {
  projectId = '';
  projectName = '';
  customerAccount = '';
  projectStage = '';

  requirements: PIRItemRequirement[] = [];
  filteredRequirements: PIRItemRequirement[] = [];
  searchTerm = '';
  isLoading = false;
  isPosting = false;
  activeFilter: StatusFilter = 'all';
  showConfirmModal = false;
  salesIdError = '';

  private _selectedLines = new Map<number, SelectedLine>();

  get selectedLines(): Map<number, SelectedLine> { return this._selectedLines; }

  get activeSalesId(): string | null {
    if (this._selectedLines.size === 0) return null;
    return [...this._selectedLines.values()][0].req.SalesId;
  }

  get selectedCount(): number { return this._selectedLines.size; }

  get selectedLinesList(): SelectedLine[] {
    return [...this._selectedLines.values()];
  }

  get openCount(): number {
    return this.requirements.filter(r => r.SalesStatus === 'Backorder').length;
  }

  get partialCount(): number {
    return this.requirements.filter(r =>
      r.RemainInventPhysical > 0 &&
      r.RemainInventPhysical < r.QuantityOrdered
    ).length;
  }

  get closedCount(): number {
    return this.requirements.filter(r =>
      r.SalesStatus === 'Delivered' || r.RemainInventPhysical === 0
    ).length;
  }

  readonly filterChips: { id: StatusFilter; label: string; icon: string }[] = [
    { id: 'all',      label: 'All',      icon: 'apps-outline' },
    { id: 'backorder', label: 'Backorder', icon: 'time-outline' },
    { id: 'partial',  label: 'Partial',  icon: 'pie-chart-outline' },
    { id: 'closed',   label: 'Closed',   icon: 'checkmark-circle-outline' },
  ];

  private searchSubject = new Subject<string>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private toastCtrl: ToastController,
    private service: ProjectItemRequirementsService,
  ) {
    this.searchSubject.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => this.applyFilter());
  }

  ngOnInit() {
    this.projectId = this.route.snapshot.paramMap.get('projectId') ?? '';
    const nav = this.router.getCurrentNavigation();
    const state = nav?.extras?.state ?? history.state;
    this.projectName = state?.['projectName'] ?? '';
    this.customerAccount = state?.['customerAccount'] ?? '';
    this.projectStage = state?.['projectStage'] ?? '';
  }

  ionViewWillEnter() {
    this._selectedLines.clear();
    this.salesIdError = '';
    this.loadRequirements();
  }

  loadRequirements() {
    this.isLoading = true;
    this.service.getItemRequirements(this.projectId).subscribe({
      next: (res: any) => {
        this.requirements = res.value ?? [];
        this.applyFilter();
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        const t = await this.toastCtrl.create({
          message: 'Could not load item requirements.',
          duration: 3000, color: 'danger', position: 'bottom',
        });
        await t.present();
      }
    });
  }

  applyFilter() {
    let base = this.requirements;
    switch (this.activeFilter) {
      case 'backorder':
        base = base.filter(r => r.SalesStatus === 'Backorder');
        break;
      case 'partial':
        base = base.filter(r => r.RemainInventPhysical > 0 && r.RemainInventPhysical < r.QuantityOrdered);
        break;
      case 'closed':
        base = base.filter(r => r.SalesStatus === 'Delivered' || r.RemainInventPhysical === 0);
        break;
    }
    if (this.searchTerm.trim()) {
      const t = this.searchTerm.toLowerCase();
      base = base.filter(r =>
        r.ItemId.toLowerCase().includes(t) ||
        (r.Name ?? '').toLowerCase().includes(t) ||
        r.SalesId.toLowerCase().includes(t) ||
        String(r.LineNum).includes(t)
      );
    }
    this.filteredRequirements = base;
  }

  onQueryChange(term: string) {
    this.searchTerm = term;
    this.searchSubject.next(term);
    this.applyFilter();
  }

  setFilter(id: StatusFilter) {
    this.activeFilter = id;
    this.applyFilter();
  }

  isSelectable(req: PIRItemRequirement): boolean {
    return req.RemainInventPhysical > 0;
  }

  isSelected(req: PIRItemRequirement): boolean {
    return this._selectedLines.has(req.LineNum);
  }

  toggleLine(req: PIRItemRequirement) {
    if (!this.isSelectable(req)) return;
    this.salesIdError = '';

    if (this.isSelected(req)) {
      this._selectedLines.delete(req.LineNum);
      return;
    }

    if (this.activeSalesId && req.SalesId !== this.activeSalesId) {
      this.salesIdError = 'Picking lists can only group lines from the same sales order. Deselect lines or create separate picking lists.';
      return;
    }

    this._selectedLines.set(req.LineNum, { req, qty: req.RemainInventPhysical });
  }

  getQty(lineNum: number): number {
    return this._selectedLines.get(lineNum)?.qty ?? 0;
  }

  decrementQty(lineNum: number, event: Event) {
    event.stopPropagation();
    const entry = this._selectedLines.get(lineNum);
    if (!entry || entry.qty <= 1) return;
    entry.qty--;
  }

  incrementQty(lineNum: number, event: Event) {
    event.stopPropagation();
    const entry = this._selectedLines.get(lineNum);
    if (!entry || entry.qty >= entry.req.RemainInventPhysical) return;
    entry.qty++;
  }

  openConfirm() {
    if (this._selectedLines.size === 0) return;
    this.showConfirmModal = true;
  }

  closeConfirm() {
    this.showConfirmModal = false;
  }

  postPickingList() {
    if (this.isPosting || this._selectedLines.size === 0) return;

    const lines = [...this._selectedLines.values()];
    const salesOrderID = lines[0].req.SalesId;

    const request: PickingListRequest = {
      DataAreaId: 'USMF',
      SalesOrderID: salesOrderID,
      packingSlipId: '',
      salesLineNum: lines.map(l => l.req.LineNum),
      packingSlipQty: lines.map(l => l.qty),
    };

    this.isPosting = true;
    this.showConfirmModal = false;

    this.service.postPickingList(request).subscribe({
      next: (res: any) => {
        this.isPosting = false;
        if (res?.Success === false) {
          this.router.navigate(
            ['/inventory/project-item-requirements/result'],
            {
              state: {
                success: false,
                errorMessage: res.ErrorMessage ?? 'Posting failed.',
                errorPayload: JSON.stringify(res),
                retryRequest: request,
                projectId: this.projectId,
                projectName: this.projectName,
              }
            }
          );
          return;
        }
        this.router.navigate(
          ['/inventory/project-item-requirements/result'],
          {
            state: {
              success: true,
              lineCount: lines.length,
              salesOrderID,
              packingSlipId: res?.PackingSlipId ?? res?.packingSlipId ?? '',
              projectId: this.projectId,
              projectName: this.projectName,
            }
          }
        );
      },
      error: (err: any) => {
        this.isPosting = false;
        const errorMessage = err?.error?.error?.message ?? err?.message ?? 'Failed to post picking list.';
        this.router.navigate(
          ['/inventory/project-item-requirements/result'],
          {
            state: {
              success: false,
              errorMessage,
              errorPayload: JSON.stringify(err?.error ?? err),
              retryRequest: request,
              projectId: this.projectId,
              projectName: this.projectName,
            }
          }
        );
      }
    });
  }

  doRefresh(event: CustomEvent) {
    this._selectedLines.clear();
    this.salesIdError = '';
    this.loadRequirements();
    setTimeout(() => (event.target as HTMLIonRefresherElement).complete(), 1000);
  }

  getRemainingPct(req: PIRItemRequirement): number {
    if (!req.QuantityOrdered) return 0;
    return Math.round((req.RemainInventPhysical / req.QuantityOrdered) * 100);
  }

  getStatusColor(req: PIRItemRequirement): string {
    if (req.RemainInventPhysical === 0 || req.SalesStatus === 'Delivered') return '#6b7280';
    if (req.RemainInventPhysical < req.QuantityOrdered) return '#d97706';
    return '#16a34a';
  }

  getStatusLabel(req: PIRItemRequirement): string {
    if (req.RemainInventPhysical === 0 || req.SalesStatus === 'Delivered') return 'Closed';
    if (req.RemainInventPhysical < req.QuantityOrdered) return 'Partial';
    return 'Backorder';
  }

  getStatusBg(req: PIRItemRequirement): string {
    if (req.RemainInventPhysical === 0 || req.SalesStatus === 'Delivered') return 'rgba(107,114,128,.12)';
    if (req.RemainInventPhysical < req.QuantityOrdered) return 'rgba(217,119,6,.12)';
    return 'rgba(22,163,74,.12)';
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  getDimensions(req: PIRItemRequirement): string {
    return [req.ProductConfigurationId, req.ProductStyleId, req.ProductSizeId, req.ProductColorId]
      .filter(Boolean).join(' · ');
  }
}
