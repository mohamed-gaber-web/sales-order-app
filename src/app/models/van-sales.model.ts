// ── Van Sales Models ────────────────────────────────────────────────────────
// The driver browses a product catalogue, builds a cart, then checks out —
// D365 gets one sales order with a line per cart item.

/**
 * A catalogue entry as shown to the driver.
 *
 * Built from `ProductsV2` and enriched with price/unit from `ReleasedProductsV2`
 * (only released products are sellable and carry a price).
 *
 * `imageUrl` is read defensively: `ProductsV2` in this environment returns no
 * image column, so it is almost always undefined and the UI renders an initial
 * tile instead. If the entity is ever extended with an image field the catalogue
 * picks it up without a code change — see `VanSalesService.readImageUrl`.
 */
export interface VanProduct {
  itemNumber: string;
  name: string;
  searchName?: string;
  description?: string;
  productType?: string;
  /** Absolute URL or data: URI, when the API exposes one. */
  imageUrl?: string;
  /** Unit price from ReleasedProductsV2; undefined when the product isn't released. */
  price?: number;
  unit?: string;
  /** True when a released-product record exists — i.e. the driver can sell it. */
  isSellable: boolean;
}

/** One product in the driver's cart. Quantity is always ≥ 1. */
export interface VanCartLine {
  itemNumber: string;
  name: string;
  imageUrl?: string;
  price: number;
  unit?: string;
  qty: number;
}

/** What the driver picked on the checkout page before pressing Receive. */
export interface VanCheckoutDetails {
  customerAccount: string;
  customerName: string;
  currencyCode: string;
  siteId: string;
  warehouseId: string;
}

/** Result of a completed van sale, used to render the success screen and label. */
export interface VanSaleResult {
  orderNumber: string;
  customerAccount: string;
  customerName: string;
  currencyCode: string;
  siteId: string;
  warehouseId: string;
  lines: VanCartLine[];
  totalQty: number;
  totalAmount: number;
  /** Item numbers D365 rejected — the order exists but these lines are missing. */
  failedItems: string[];
  soldAt: Date;
}
