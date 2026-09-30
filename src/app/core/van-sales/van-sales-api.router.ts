import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { VAN_SALES_CONFIG } from './van-sales.config';
import { VanSalesApi } from './van-sales-api';
import { VanApiNo } from './van-sales-endpoints';
import { VanSalesHttpApi } from './van-sales-http.api';
import { VanSalesMockApi } from './van-sales-mock.api';
import { ApprovalStatus, ChequeStatus, ServiceEnvelope, SurveyDefinition } from './van-sales.models';

/**
 * The one `VanSalesApi` the app injects. Each call names its API number and is
 * sent to the mock or the real adapter from the environment (spec §6.4):
 * `vanSalesApi: 'mock'` sends everything to the mock; `'http'` sends
 * everything to D365 except the numbers in `vanSalesMockEndpoints`.
 */
@Injectable({ providedIn: 'root' })
export class VanSalesApiRouter implements VanSalesApi {
  private readonly http = inject(VanSalesHttpApi);
  readonly mock = inject(VanSalesMockApi);

  readonly isMock = VAN_SALES_CONFIG.api === 'mock';

  private pick(apiNo: number): VanSalesApi {
    if (VAN_SALES_CONFIG.api === 'mock') return this.mock;
    return VAN_SALES_CONFIG.mockEndpoints.includes(apiNo) ? this.mock : this.http;
  }

  getRepSetup() { return this.pick(12).getRepSetup(); }
  getJourney(routeId: string) { return this.pick(13).getJourney(routeId); }
  getCustomers(routeId: string) { return this.pick(1).getCustomers(routeId); }
  getProducts() { return this.pick(5).getProducts(); }
  getPrices() { return this.pick(8).getPrices(); }
  getTaxGroups() { return this.pick(9).getTaxGroups(); }
  getReturnReasons() { return this.pick(10).getReturnReasons(); }
  getPromotions() { return this.pick(14).getPromotions(); }
  getSurveys() { return this.pick(15).getSurveys(); }
  getLoyaltyRules() { return this.pick(16).getLoyaltyRules(); }
  getBanks() { return this.pick(17).getBanks(); }
  getVanStock(warehouse: string) { return this.pick(20).getVanStock(warehouse); }
  getOrders(routeId: string) { return this.pick(21).getOrders(routeId); }
  getLastPrices(routeId: string) { return this.pick(18).getLastPrices(routeId); }

  getOpenInvoices(customerId: string) { return this.pick(18).getOpenInvoices(customerId); }
  checkCredit(customerId: string) { return this.pick(19).checkCredit(customerId); }
  getLoyaltyBalance(customerId: string) { return this.pick(22).getLoyaltyBalance(customerId); }
  calculatePrice(body: unknown) { return this.pick(23).calculatePrice(body); }

  post(apiNo: VanApiNo, body: Record<string, unknown>): Observable<ServiceEnvelope> {
    return this.pick(apiNo).post(apiNo, body);
  }

  listApprovals() { return this.pick(91).listApprovals(); }
  decideApproval(id: string, status: Exclude<ApprovalStatus, 'PENDING'>) {
    return this.pick(92).decideApproval(id, status);
  }
  listCheques() { return this.pick(93).listCheques(); }
  updateChequeStatus(receiptId: string, number: string, bank: string, status: ChequeStatus) {
    return this.pick(93).updateChequeStatus(receiptId, number, bank, status);
  }
  getEDocStatus(uuids: string[]) { return this.pick(43).getEDocStatus(uuids); }
  saveSurvey(def: SurveyDefinition) { return this.pick(15).saveSurvey(def); }
  deleteSurvey(id: string) { return this.pick(15).deleteSurvey(id); }
}
