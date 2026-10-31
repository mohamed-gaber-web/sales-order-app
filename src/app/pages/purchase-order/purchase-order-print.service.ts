import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MobileConfigStore } from '../../core/auth/mobile-config.store';
import { PortalSessionStore } from '../../core/auth/portal-session.store';
import {
  PdfService,
  PurchaseConfirmationPdfData,
  PurchaseReceiptLine,
} from '../../core/services/pdf.service';
import { PurchaseOrderService } from '../../core/services/purchase-order.service';
import { TenantConfigStore } from '../../core/tenant/tenant-config.store';
import { PurchaseOrderHeader, PurchaseOrderLine } from '../../models/purchase-order.model';

/** Statuses D365 can receive against — and so the ones with a confirmation to print. */
export function isConfirmedOrder(po: Pick<PurchaseOrderHeader, 'DocumentApprovalStatus'> | null | undefined): boolean {
  const status = po?.DocumentApprovalStatus;
  return status === 'Confirmed' || status === 'Finalized';
}

/** What the purchase order screens print, built the same way wherever it is printed from. */
@Injectable({ providedIn: 'root' })
export class PurchaseOrderPrintService {
  private readonly pdf = inject(PdfService);
  private readonly poService = inject(PurchaseOrderService);
  private readonly tenantConfig = inject(TenantConfigStore);
  private readonly session = inject(PortalSessionStore);
  private readonly mobileConfig = inject(MobileConfigStore);

  /** The workspace's own logo, set in the admin portal. */
  get logo(): string | null {
    return this.mobileConfig.logoFor(this.session.tenant()?.slug);
  }

  vendorOf(po: PurchaseOrderHeader | null | undefined): string | undefined {
    return (po?.OrderVendorAccountNumber ?? po?.VendorAccountNumber) as string | undefined;
  }

  dataAreaIdOf(po: PurchaseOrderHeader | null | undefined): string {
    return (po?.dataAreaId as string) ?? this.tenantConfig.currentDataAreaId();
  }

  /** D365 carries the product name in LineDescription on PurchaseOrderLinesV2. */
  lines(lines: PurchaseOrderLine[], qty: (l: PurchaseOrderLine) => number): PurchaseReceiptLine[] {
    return lines.map((l) => ({
      lineNumber: l.LineNumber,
      itemNumber: l.ItemNumber,
      productName: l.ProductName || l.LineDescription,
      site: l.ReceivingSiteId,
      warehouse: l.ReceivingWarehouseId,
      quantity: qty(l),
      unit: l.PurchaseUnitSymbol,
    }));
  }

  /**
   * The order's confirmation. `confirmDate` is only known right after confirming
   * in the app — D365 does not return it on the header — so a reprint omits it.
   */
  confirmation(po: PurchaseOrderHeader, confirmDate?: Date): PurchaseConfirmationPdfData {
    return {
      poNumber: po.PurchaseOrderNumber,
      dataAreaId: this.dataAreaIdOf(po),
      vendor: this.vendorOf(po),
      confirmDate,
      lines: this.lines(po.PurchaseOrderLinesV2 ?? [], orderedQty),
      logo: this.logo,
    };
  }

  /** Prints a confirmation for an order whose lines are not loaded yet, as on the list. */
  async printConfirmationFor(po: PurchaseOrderHeader): Promise<void> {
    const full = await firstValueFrom(this.poService.getOrderWithLines(po.PurchaseOrderNumber, po.dataAreaId));
    await this.pdf.printPurchaseConfirmation(this.confirmation(full));
  }
}

function orderedQty(line: PurchaseOrderLine): number {
  const n = Number(line.OrderedPurchaseQuantity ?? line.PurchaseQuantity);
  return isNaN(n) || n < 0 ? 0 : n;
}
