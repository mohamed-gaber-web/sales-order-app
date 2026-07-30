import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { PurchaseOrderScanDocumentPage } from './purchase-order-scan-document.page';
import { PoScanDocumentService } from './po-scan-document.service';
import { DesignSystemModule } from '../../../shared/design-system/design-system.module';
import { LabelPreviewModalModule } from '../label-preview/label-preview-modal.module';

const routes: Routes = [
  {
    path: '',
    component: PurchaseOrderScanDocumentPage
  }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    RouterModule.forChild(routes),
    DesignSystemModule,
    LabelPreviewModalModule
  ],
  declarations: [PurchaseOrderScanDocumentPage],
  // Scoped to this route so the scan flow's state dies with the feature
  // instead of living in the root injector.
  providers: [PoScanDocumentService]
})
export class PurchaseOrderScanDocumentModule {}
