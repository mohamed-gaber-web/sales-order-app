import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ActionSheetController, ToastController } from '@ionic/angular';
import { ProjectIssuanceService, ItemRequirement } from '../../../../core/services/project-issuance.service';

@Component({
  selector: 'app-project-issuance-detail',
  templateUrl: './project-issuance-detail.page.html',
  styleUrls: ['./project-issuance-detail.page.scss'],
  standalone: false,
})
export class ProjectIssuanceDetailPage implements OnInit {
  projectId = '';
  projectName = '';
  customerAccount = '';
  projectStage = '';
  dataAreaId = 'usmf';

  requirements: ItemRequirement[] = [];
  filteredRequirements: ItemRequirement[] = [];
  searchTerm = '';
  isLoading = false;
  showAll = false;
  activeTab = 'requirements';

  get openCount(): number {
    return this.requirements.filter(r => (r.LineStatus ?? '').toLowerCase() === 'open').length;
  }

  get partialCount(): number {
    return this.requirements.filter(r => (r.LineStatus ?? '').toLowerCase() === 'partial').length;
  }

  get closedCount(): number {
    return this.requirements.filter(r => (r.LineStatus ?? '').toLowerCase() === 'closed').length;
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private toastCtrl: ToastController,
    private actionSheetCtrl: ActionSheetController,
    private service: ProjectIssuanceService,
  ) {}

  ngOnInit() {
    this.projectId = this.route.snapshot.paramMap.get('projectId') ?? '';
    const nav = this.router.getCurrentNavigation();
    const state = nav?.extras?.state ?? history.state;
    this.projectName = state?.['projectName'] ?? '';
    this.customerAccount = state?.['customerAccount'] ?? '';
    this.projectStage = state?.['projectStage'] ?? '';
    this.dataAreaId = state?.['dataAreaId'] ?? 'usmf';
  }

  ionViewWillEnter() {
    this.loadRequirements();
  }

  loadRequirements() {
    this.isLoading = true;
    this.service.getItemRequirements(this.projectId, this.dataAreaId).subscribe({
      next: res => {
        this.requirements = res.value;
        this.applyFilter();
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        const t = await this.toastCtrl.create({ message: 'Could not load item requirements.', duration: 3000, color: 'danger', position: 'bottom' });
        await t.present();
      }
    });
  }

  applyFilter() {
    let base = this.showAll ? this.requirements : this.requirements.filter(r => r.RemainingQuantity > 0);
    if (this.searchTerm.trim()) {
      const t = this.searchTerm.toLowerCase();
      base = base.filter(r =>
        r.ItemNumber.toLowerCase().includes(t) ||
        (r.ProductName ?? '').toLowerCase().includes(t)
      );
    }
    this.filteredRequirements = base;
  }

  onSearchChange(term: string) {
    this.searchTerm = term;
    this.applyFilter();
  }

  toggleShowAll() {
    this.showAll = !this.showAll;
    this.applyFilter();
  }

  async openRequirementAction(req: ItemRequirement) {
    const sheet = await this.actionSheetCtrl.create({
      header: `${req.ItemNumber}${req.ProductName ? ' · ' + req.ProductName : ''}`,
      subHeader: `${req.RemainingQuantity} remaining of ${req.RequiredQuantity}`,
      buttons: [
        {
          text: 'Post Picking List',
          icon: 'document-text-outline',
          handler: () => this.navigateToLine(req, false),
        },
        {
          text: 'Post Picking List + Packing Slip',
          icon: 'cube-outline',
          handler: () => this.navigateToLine(req, true),
        },
        {
          text: 'View / Edit Details',
          icon: 'eye-outline',
          handler: () => this.navigateToLine(req, false),
        },
        {
          text: 'Cancel',
          icon: 'close-outline',
          role: 'cancel',
        },
      ],
    });
    await sheet.present();
  }

  private navigateToLine(req: ItemRequirement, postPackingSlip: boolean) {
    this.router.navigate(
      ['/inventory/project-issuance/line', this.projectId, req.LineNumber],
      {
        state: {
          projectName: this.projectName,
          dataAreaId: this.dataAreaId,
          itemNumber: req.ItemNumber,
          productName: req.ProductName,
          salesCategory: req.SalesCategory,
          linePropertyId: req.LinePropertyId,
          requiredQuantity: req.RequiredQuantity,
          remainingQuantity: req.RemainingQuantity,
          lineStatus: req.LineStatus,
          requestedReceiptDate: req.RequestedReceiptDate,
          postPackingSlip,
        }
      }
    );
  }

  openAdhoc() {
    this.router.navigate(
      ['/inventory/project-issuance/adhoc', this.projectId],
      { state: { projectName: this.projectName, dataAreaId: this.dataAreaId } }
    );
  }

  goBack() {
    this.router.navigate(['/inventory/project-issuance']);
  }

  doRefresh(event: CustomEvent) {
    this.loadRequirements();
    setTimeout(() => (event.target as HTMLIonRefresherElement).complete(), 1000);
  }

  getRemainingPct(req: ItemRequirement): number {
    if (!req.RequiredQuantity) return 0;
    return Math.round((req.RemainingQuantity / req.RequiredQuantity) * 100);
  }

  getStatusColor(status?: string): string {
    switch ((status ?? '').toLowerCase()) {
      case 'open':    return '#16a34a';
      case 'partial': return '#d97706';
      case 'closed':  return '#6b7280';
      default:        return '#2563eb';
    }
  }

  getStatusBg(status?: string): string {
    switch ((status ?? '').toLowerCase()) {
      case 'open':    return 'rgba(22,163,74,.12)';
      case 'partial': return 'rgba(217,119,6,.12)';
      case 'closed':  return 'rgba(107,114,128,.12)';
      default:        return 'rgba(37,99,235,.12)';
    }
  }
}
