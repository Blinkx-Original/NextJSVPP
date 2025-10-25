export const CTA_DEFAULT_LABELS = {
  lead: 'Request a quote',
  affiliate: 'Buy via Affiliate',
  stripe: 'Pay with Stripe',
  paypal: 'Pay with PayPal'
} as const;

export type CtaKind = keyof typeof CTA_DEFAULT_LABELS;

export function resolveCtaLabel(type: CtaKind, label: string | null | undefined): string {
  const trimmed = typeof label === 'string' ? label.trim() : '';
  if (trimmed.length > 0) {
    return trimmed;
  }
  return CTA_DEFAULT_LABELS[type];
}
