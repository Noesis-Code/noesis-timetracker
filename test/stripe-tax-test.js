// Corps Checkout avec/sans Stripe Tax (sans réseau). Usage : node test/stripe-tax-test.js
const stripe = require('../server/lib/stripe');
let failed = 0;
const ok = (c, l) => { if (c) console.log('  ok  ' + l); else { failed++; console.log('  FAIL ' + l); } };
const base = { mode: 'subscription', priceId: 'price_x', successUrl: 'https://a/s', cancelUrl: 'https://a/c', customerEmail: 'a@b.c', metadata: {} };

delete process.env.STRIPE_TAX_ENABLED;
let p = stripe.buildCheckoutParams(base);
ok(!p.automatic_tax && !p.billing_address_collection && !p.customer_update, 'sans variable : aucune option de taxe');

process.env.STRIPE_TAX_ENABLED = '0';
p = stripe.buildCheckoutParams(base);
ok(!p.automatic_tax, 'STRIPE_TAX_ENABLED=0 : aucune option de taxe');

process.env.STRIPE_TAX_ENABLED = '1';
p = stripe.buildCheckoutParams(base);
ok(p.automatic_tax.enabled === true && p.billing_address_collection === 'auto' && !p.customer_update, 'sans customer : automatic_tax + billing_address_collection=auto');
p = stripe.buildCheckoutParams({ ...base, customerId: 'cus_1' });
ok(p.automatic_tax.enabled === true && p.customer_update.address === 'auto' && !p.billing_address_collection && !p.customer_email, 'avec customer : customer_update[address]=auto');
process.exit(failed ? 1 : 0);
