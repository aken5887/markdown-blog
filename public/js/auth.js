/**
 * auth.js (client)
 *
 * Exposes window.ensureAuth() - resolves with a token once the user has
 * verified (or just set) the shared password, rejects if they cancel.
 * window.authHeaders() returns the header object to attach to mutating
 * fetch calls.
 */
(function () {
  const TOKEN_KEY = 'devlog_auth_token';
  const EXPIRY_KEY = 'devlog_auth_expiry';

  function getStoredToken() {
    const token = sessionStorage.getItem(TOKEN_KEY);
    const expiry = Number(sessionStorage.getItem(EXPIRY_KEY) || 0);
    if (token && Date.now() < expiry) return token;
    return null;
  }

  function storeToken(token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(EXPIRY_KEY, String(Date.now() + 29 * 60 * 1000));
  }

  function field(placeholder) {
    const input = document.createElement('input');
    input.type = 'password';
    input.placeholder = placeholder;
    input.className = 'auth-input';
    return input;
  }

  function ensureAuth() {
    const existing = getStoredToken();
    if (existing) return Promise.resolve(existing);

    return fetch('/api/auth/status')
      .then((res) => res.json())
      .then(
        ({ hasPassword }) =>
          new Promise((resolve, reject) => {
            const overlay = document.createElement('div');
            overlay.className = 'auth-overlay';
            overlay.innerHTML =
              '<div class="auth-modal">' +
              '<button class="auth-close" type="button" aria-label="닫기">×</button>' +
              '<h2 class="auth-title"></h2>' +
              '<p class="auth-message"></p>' +
              '<div class="auth-fields"></div>' +
              '<p class="auth-error" hidden></p>' +
              '<button class="btn-primary auth-submit" type="button"></button>' +
              '<button class="auth-link" type="button" hidden>비밀번호 변경</button>' +
              '</div>';
            document.body.appendChild(overlay);

            const titleEl = overlay.querySelector('.auth-title');
            const msgEl = overlay.querySelector('.auth-message');
            const fieldsEl = overlay.querySelector('.auth-fields');
            const errorEl = overlay.querySelector('.auth-error');
            const submitBtn = overlay.querySelector('.auth-submit');
            const linkBtn = overlay.querySelector('.auth-link');
            const closeBtn = overlay.querySelector('.auth-close');

            function close(result) {
              overlay.remove();
              if (result) resolve(result);
              else reject(new Error('cancelled'));
            }

            closeBtn.addEventListener('click', () => close(null));
            overlay.addEventListener('click', (e) => {
              if (e.target === overlay) close(null);
            });

            function showError(msg) {
              errorEl.textContent = msg;
              errorEl.hidden = false;
            }

            function renderSetMode() {
              titleEl.textContent = '비밀번호 설정';
              msgEl.textContent = '글쓰기 · 수정 · 삭제를 보호할 비밀번호를 설정해주세요.';
              fieldsEl.innerHTML = '';
              const pw = field('새 비밀번호 (4자 이상)');
              const pw2 = field('비밀번호 확인');
              fieldsEl.appendChild(pw);
              fieldsEl.appendChild(pw2);
              linkBtn.hidden = true;
              submitBtn.textContent = '설정';
              submitBtn.onclick = async () => {
                errorEl.hidden = true;
                if (pw.value.length < 4) return showError('비밀번호는 4자 이상이어야 해요.');
                if (pw.value !== pw2.value) return showError('비밀번호가 일치하지 않아요.');
                const res = await fetch('/api/auth/set-password', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ password: pw.value }),
                });
                const data = await res.json();
                if (!res.ok) return showError('설정에 실패했어요.');
                storeToken(data.token);
                close(data.token);
              };
            }

            function renderEnterMode() {
              titleEl.textContent = '비밀번호 확인';
              msgEl.textContent = '계속하려면 비밀번호를 입력해주세요.';
              fieldsEl.innerHTML = '';
              const pw = field('비밀번호');
              fieldsEl.appendChild(pw);
              pw.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') submitBtn.click();
              });
              linkBtn.hidden = false;
              linkBtn.textContent = '비밀번호 변경';
              linkBtn.onclick = renderChangeMode;
              submitBtn.textContent = '확인';
              submitBtn.onclick = async () => {
                errorEl.hidden = true;
                const res = await fetch('/api/auth/verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ password: pw.value }),
                });
                const data = await res.json();
                if (!res.ok) return showError('비밀번호가 올바르지 않아요.');
                storeToken(data.token);
                close(data.token);
              };
            }

            function renderChangeMode() {
              titleEl.textContent = '비밀번호 변경';
              msgEl.textContent = '현재 비밀번호와 새 비밀번호를 입력해주세요.';
              fieldsEl.innerHTML = '';
              const cur = field('현재 비밀번호');
              const next = field('새 비밀번호 (4자 이상)');
              const next2 = field('새 비밀번호 확인');
              fieldsEl.appendChild(cur);
              fieldsEl.appendChild(next);
              fieldsEl.appendChild(next2);
              linkBtn.hidden = true;
              submitBtn.textContent = '변경';
              submitBtn.onclick = async () => {
                errorEl.hidden = true;
                if (next.value.length < 4) return showError('새 비밀번호는 4자 이상이어야 해요.');
                if (next.value !== next2.value) return showError('새 비밀번호가 일치하지 않아요.');
                const res = await fetch('/api/auth/change-password', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ currentPassword: cur.value, newPassword: next.value }),
                });
                const data = await res.json();
                if (!res.ok) return showError('현재 비밀번호가 올바르지 않아요.');
                storeToken(data.token);
                close(data.token);
              };
            }

            if (hasPassword) renderEnterMode();
            else renderSetMode();
          })
      );
  }

  function authHeaders() {
    const token = getStoredToken();
    return token ? { 'x-auth-token': token } : {};
  }

  window.ensureAuth = ensureAuth;
  window.authHeaders = authHeaders;
})();
