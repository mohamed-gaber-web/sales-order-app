import { environment } from '../../../environments/environment';

/**
 * Van Sales settings, read defensively.
 *
 * `environment.ts` is kept out of git's view on developer machines
 * (skip-worktree), so the fields below may be missing from a fresh checkout's
 * copy. Every one has a safe default: the mock backend, no dev tools.
 */
const env = environment as {
  vanSalesApi?: 'http' | 'mock';
  vanSalesMockEndpoints?: number[];
  etaMiddlewareBaseUrl?: string;
  devTools?: boolean;
};

export const VAN_SALES_CONFIG = {
  api: env.vanSalesApi ?? 'mock',
  mockEndpoints: env.vanSalesMockEndpoints ?? [],
  etaMiddlewareBaseUrl: env.etaMiddlewareBaseUrl ?? '',
  devTools: env.devTools ?? false,
} as const;
