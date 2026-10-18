# Inventory Management

## Implemented

- `src/inventory/inventory.service.ts` owns the Firestore inventory ledger and atomically updates the denormalized public `products.inStock` and `products.stockQuantity` fields.
- Inventory records track on-hand, reserved, available, incoming, damaged, reorder level, version, updater and update time.
- Immutable movements cover opening balances, purchase receipts, reservations, releases, dispatches, returns, damage, manual adjustments and physical counts.
- `src/business/business-inventory.controller.ts` exposes authenticated, CSRF-protected mutation APIs plus inventory, low-stock and movement read APIs.
- Product creation initializes inventory and an opening-balance movement. Product updates no longer accept direct stock fields.
- Business order confirm, dispatch, cancel and return actions are idempotent at the inventory layer. Confirmation reserves stock; dispatch consumes it; cancellation releases it; inspected returns restore it.
- Swagger/OpenAPI contains the complete inventory and fulfillment contract.
- `business-delta-ui/src/Components/Inventory` provides dashboard totals, filters, stock operations, movement history and CSV export. The placed-orders page exposes valid fulfillment actions.

## Operational rules

- Available stock is `on hand - reserved` and can never be negative.
- Carts, quotation requests and newly placed orders do not reserve stock.
- Damage is recorded as a negative on-hand adjustment and increments the damaged counter.
- Manual changes and physical counts require a reason; receipts require a purchase/receipt reference.
- Stock movements remain after a product is deleted to preserve the audit trail.

## Follow-up work

- Add supplier and purchase-order collections so incoming stock is derived rather than manually represented.
- Add partial dispatch, partial cancellation and partial return DTOs when operations require line-level fulfillment.
- Add warehouse/location records before supporting multiple physical stores.
- Add scheduled reservation expiry only if orders are allowed to remain confirmed without manual follow-up.
- Add inventory valuation after product cost-price data is introduced.
