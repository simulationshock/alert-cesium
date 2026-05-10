export interface LoginViewModel {
  loginUrl?: string;
  error?: string;
}

export function renderLoginShell(model: LoginViewModel = {}): string {
  const loginUrl = model.loginUrl ?? '/auth/login';
  const error = model.error ? `<p role="alert" class="auth-error">${escapeHtml(model.error)}. Please try again.</p>` : '';
  return `
    <main class="sandbox-login" aria-labelledby="sandbox-login-title">
      <h1 id="sandbox-login-title">Sign in to the Cesium sandbox</h1>
      <p>Use the configured OAuth2 provider to access protected sandbox content.</p>
      ${error}
      <a class="oauth2-login-button" href="${escapeHtml(loginUrl)}">Sign in with OAuth2</a>
    </main>
  `.trim();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] ?? char));
}
