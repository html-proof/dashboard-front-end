// Accepts "store" or "store.myshopify.com" and sends the normalised domain to /shopify/auth.
document.querySelector('.connect-form').addEventListener('submit', (event) => {
  const input = event.target.elements.shop;
  const value = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  input.value = value.endsWith('.myshopify.com') ? value : `${value}.myshopify.com`;
});

// Send the OAuth start to the backend when it is hosted separately (Vercel frontend + Railway API).
if (window.BACKEND_URL) document.querySelector('.connect-form').action = `${window.BACKEND_URL}/shopify/auth`;
