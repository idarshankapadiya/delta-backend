/** Uses the same environment flag and default as the storefront. */
export function getProductPricing(product: {
  price: number;
  discountPercentage: number;
}): { unitPrice: number; discountPercentage: number } {
  const discountsEnabled = process.env.VITE_DISCOUNTS_ENABLED !== 'false';
  const discountPercentage =
    discountsEnabled && product.discountPercentage > 0
      ? product.discountPercentage
      : 0;

  return {
    unitPrice: product.price * (1 - discountPercentage / 100),
    discountPercentage,
  };
}
