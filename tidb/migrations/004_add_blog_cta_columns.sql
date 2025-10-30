ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS cta_lead_label VARCHAR(120) NULL AFTER cta_lead_url,
  ADD COLUMN IF NOT EXISTS cta_affiliate_label VARCHAR(120) NULL AFTER cta_affiliate_url,
  ADD COLUMN IF NOT EXISTS cta_stripe_url TEXT NULL AFTER cta_affiliate_label,
  ADD COLUMN IF NOT EXISTS cta_stripe_label VARCHAR(120) NULL AFTER cta_stripe_url,
  ADD COLUMN IF NOT EXISTS cta_paypal_url TEXT NULL AFTER cta_stripe_label,
  ADD COLUMN IF NOT EXISTS cta_paypal_label VARCHAR(120) NULL AFTER cta_paypal_url;
