/* One dismissible invitation per tab session; never interrupts checkout. */
(() => {
  if (window.__mhLoginInvitation) return;
  window.__mhLoginInvitation = true;
  const key = 'mh-login-invitation-seen-v1';
  const excluded = /(?:admin|login|register|account|checkout|order|track)/i;
  if (excluded.test(location.pathname)) return;
  try { if (sessionStorage.getItem(key)) return; } catch { return; }
  const account = fetch('/api/customer/account', { credentials: 'same-origin', cache: 'no-store' })
    .then(async response => response.status === 401 ? false : response.ok ? Boolean((await response.json()).authenticated) : null)
    .catch(() => null);
  setTimeout(async () => {
    if (await account !== false || document.visibilityState !== 'visible') return;
    if (document.querySelector('dialog[open],#headless-iframe,.mh-universal-cart.open,.drawer.open,input:focus,textarea:focus')) return;
    try { sessionStorage.setItem(key, '1'); } catch { return; }
    if (typeof HTMLDialogElement === 'undefined') return;
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'mh-login-invitation';
    dialog.setAttribute('aria-labelledby', 'mhLoginInvitationTitle');
    dialog.innerHTML = `<button type="button" class="mh-login-invitation-close" aria-label="Close sign-in invitation">×</button>
      <span class="mh-login-invitation-icon" aria-hidden="true">🎁</span>
      <p class="mh-login-invitation-eyebrow">WELCOME TO MARKET HUB</p>
      <h2 id="mhLoginInvitationTitle">Your first order comes with a surprise.</h2>
      <p>Sign in to check your extra first-order mystery gift, track orders and save your favourites.</p>
      <a class="mh-login-invitation-primary" data-login-link>Sign in</a>
      <a class="mh-login-invitation-secondary" data-register-link>Create an account</a>
      <button type="button" class="mh-login-invitation-later">Continue shopping</button>`;
    const redirect = encodeURIComponent(location.pathname + location.search);
    dialog.querySelector('[data-login-link]').href = '/login.html?redirect=' + redirect;
    dialog.querySelector('[data-register-link]').href = '/register.html?redirect=' + redirect;
    dialog.querySelector('.mh-login-invitation-close').onclick = () => dialog.close();
    dialog.querySelector('.mh-login-invitation-later').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { dialog.remove(); previousFocus?.focus?.(); }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  }, 3500);
})();
