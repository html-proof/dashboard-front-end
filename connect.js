// Accepts "store" or "store.myshopify.com" and sends the normalised domain to /shopify/auth.
document.querySelector('.connect-form').addEventListener('submit', (event) => {
  const input = event.target.elements.shop;
  const value = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  input.value = value.endsWith('.myshopify.com') ? value : `${value}.myshopify.com`;
});
