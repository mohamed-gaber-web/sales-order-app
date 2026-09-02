import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Platform } from '@ionic/angular';
import { environment } from '../../../environments/environment';
import { ApiService, D365_COMPANY_HEADER } from './api.service';

const PORTAL = environment.portalApiBaseUrl;

function apiFor(native: boolean): { api: ApiService; httpMock: HttpTestingController } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      ApiService,
      { provide: Platform, useValue: { is: (name: string) => native && name === 'capacitor' } },
    ],
  });
  return { api: TestBed.inject(ApiService), httpMock: TestBed.inject(HttpTestingController) };
}

describe('ApiService — ERP routing through the portal proxy', () => {
  describe('on web', () => {
    let api: ApiService;
    let httpMock: HttpTestingController;

    beforeEach(() => ({ api, httpMock } = apiFor(false)));
    afterEach(() => httpMock.verify());

    it('routes OData reads through /api/portal/d365', () => {
      api.get('/data/Companies').subscribe();
      httpMock.expectOne('/api/portal/d365/data/Companies').flush({});
    });

    it('routes custom service calls through /api/portal/d365', () => {
      api.post('/api/services/GP_ProductionServiceGroup/GP_ProductionService/postJournal', {}).subscribe();
      httpMock
        .expectOne('/api/portal/d365/api/services/GP_ProductionServiceGroup/GP_ProductionService/postJournal')
        .flush({});
    });

    it('keeps query parameters intact', () => {
      api.get('/data/Currencies', { $top: '5', 'cross-company': 'true' }).subscribe();

      const request = httpMock.expectOne(r => r.url === '/api/portal/d365/data/Currencies');
      expect(request.request.params.get('$top')).toBe('5');
      expect(request.request.params.get('cross-company')).toBe('true');
      request.flush({});
    });

    it('carries PATCH bodies and headers through the proxy', () => {
      api.patchWithHeaders('/data/SalesOrderHeadersV3', { x: 1 }, { 'If-Match': '*' }).subscribe();

      const request = httpMock.expectOne('/api/portal/d365/data/SalesOrderHeadersV3');
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ x: 1 });
      expect(request.request.headers.get('If-Match')).toBe('*');
      request.flush({});
    });

    it('leaves the temporary sandbox paths on their own proxy route', () => {
      // The Elsewedy sandbox is a different tenant with its own bearer; routing
      // it through the portal would send it to the wrong Dynamics environment.
      api.getWithHeaders('/api/test-data/PurchaseOrderHeadersV2', undefined, {
        Authorization: 'Bearer sandbox',
      }).subscribe();

      const request = httpMock.expectOne('/api/test-data/PurchaseOrderHeadersV2');
      expect(request.request.headers.get('Authorization')).toBe('Bearer sandbox');
      request.flush({});
    });

    it('lets an explicit base URL win, for the document reader', () => {
      api.postWithHeaders('/api/ocr', {}, {}, '').subscribe();
      httpMock.expectOne('/api/ocr').flush({});
    });
  });

  describe('on native', () => {
    let api: ApiService;
    let httpMock: HttpTestingController;

    beforeEach(() => ({ api, httpMock } = apiFor(true)));
    afterEach(() => httpMock.verify());

    it('addresses the portal absolutely — there is no proxy on a device', () => {
      api.get('/data/Companies').subscribe();
      httpMock.expectOne(`${PORTAL}/d365/data/Companies`).flush({});
    });

    it('still honours an explicit base URL', () => {
      api.getWithHeaders('/data/PurchaseOrderHeadersV2', undefined, {}, 'https://sandbox.example.com').subscribe();
      httpMock.expectOne('https://sandbox.example.com/data/PurchaseOrderHeadersV2').flush({});
    });
  });

  describe('company header', () => {
    let api: ApiService;
    let httpMock: HttpTestingController;

    beforeEach(() => ({ api, httpMock } = apiFor(false)));
    afterEach(() => httpMock.verify());

    it('is absent for a tenant with one environment', () => {
      api.get('/data/Companies').subscribe();

      const request = httpMock.expectOne('/api/portal/d365/data/Companies');
      expect(request.request.headers.has(D365_COMPANY_HEADER)).toBeFalse();
      request.flush({});
    });

    it('is sent once a company is chosen', () => {
      api.companyId.set('company-uuid');
      api.get('/data/Companies').subscribe();

      const request = httpMock.expectOne('/api/portal/d365/data/Companies');
      expect(request.request.headers.get(D365_COMPANY_HEADER)).toBe('company-uuid');
      request.flush({});
    });

    it('is never added to a non-proxied request', () => {
      api.companyId.set('company-uuid');
      api.postWithHeaders('/api/ocr', {}, {}, '').subscribe();

      const request = httpMock.expectOne('/api/ocr');
      expect(request.request.headers.has(D365_COMPANY_HEADER)).toBeFalse();
      request.flush({});
    });
  });

  describe('proxy failures', () => {
    let api: ApiService;
    let httpMock: HttpTestingController;

    beforeEach(() => ({ api, httpMock } = apiFor(false)));
    afterEach(() => httpMock.verify());

    /** Fails the request with a proxy error code and returns what the caller sees. */
    function failWith(status: number, code: string): Promise<HttpErrorResponse> {
      const caught = new Promise<HttpErrorResponse>(resolve => {
        api.get('/data/Companies').subscribe({ error: resolve });
      });
      httpMock
        .expectOne('/api/portal/d365/data/Companies')
        .flush({ error: code }, { status, statusText: 'Error' });
      return caught;
    }

    it('explains an unconfigured ERP connection', async () => {
      const error = await failWith(503, 'connection_not_configured');

      expect(error instanceof HttpErrorResponse).toBeTrue();
      expect(error.status).toBe(503);
      expect(error.error.message).toContain('not set up yet');
      // The original code survives for logging.
      expect(error.error.error).toBe('connection_not_configured');
    });

    it('does not blame the user for our expired ERP credential', async () => {
      const error = await failWith(502, 'd365_unauthorized');

      expect(error.status).toBe(502);
      expect(error.error.message).toContain('could not sign in to the ERP');
    });

    it('passes an unrecognised failure through untouched', async () => {
      const caught = new Promise<HttpErrorResponse>(resolve => {
        api.get('/data/Companies').subscribe({ error: resolve });
      });
      httpMock
        .expectOne('/api/portal/d365/data/Companies')
        .flush({ some: 'other shape' }, { status: 500, statusText: 'Error' });

      const error = await caught;
      expect(error.status).toBe(500);
      expect(error.error).toEqual({ some: 'other shape' });
    });
  });
});
