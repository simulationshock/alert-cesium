import { expect, test, type Page } from '@playwright/test';

type SandboxUser = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
};

const users = new Map<string, SandboxUser>();
const sessions = new Map<string, string>();

function loginShell(returnTo = '/sandbox'): string {
  return `<!doctype html>
    <title>Cesium Sandbox Login</title>
    <main class="sandbox-login" aria-labelledby="sandbox-login-title">
      <h1 id="sandbox-login-title">Sign in to the Cesium sandbox</h1>
      <p>Use OAuth2 to access protected wildfire camera content.</p>
      <a class="oauth2-login-button" href="/auth/login?returnTo=${encodeURIComponent(returnTo)}">Sign in with OAuth2</a>
    </main>`;
}

function sandboxShell(user: SandboxUser): string {
  return `<!doctype html>
    <title>Integrated Cesium Wildfire Sandbox</title>
    <main id="sandbox" data-authenticated="true" data-location="San Diego, California">
      <h1>Integrated Cesium Wildfire Sandbox</h1>
      <p data-testid="welcome">Welcome ${user.displayName}</p>
      <section id="globe" role="application" aria-label="Cesium globe centered on San Diego"
        data-latitude="32.7157" data-longitude="-117.1611" data-height="12000">
        San Diego view ready
      </section>
    </main>`;
}

async function installMockOAuthApp(page: Page) {
  await page.route('https://sandbox.test/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cookies = Object.fromEntries((request.headers().cookie ?? '').split(';').filter(Boolean).map((cookie) => {
      const [name, ...rest] = cookie.trim().split('=');
      return [name, decodeURIComponent(rest.join('='))];
    }));

    if (url.pathname === '/' || url.pathname === '/login') {
      await route.fulfill({ status: 200, contentType: 'text/html', body: loginShell('/sandbox') });
      return;
    }

    if (url.pathname === '/auth/login') {
      const returnTo = url.searchParams.get('returnTo') ?? '/sandbox';
      await route.fulfill({
        status: 302,
        headers: { location: `/oauth/authorize?state=mock-state&returnTo=${encodeURIComponent(returnTo)}` },
        body: ''
      });
      return;
    }

    if (url.pathname === '/oauth/authorize') {
      const returnTo = url.searchParams.get('returnTo') ?? '/sandbox';
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><title>Mock OAuth Provider</title>
          <h1>Mock OAuth Provider</h1>
          <a role="button" href="/auth/callback?code=mock-code&state=mock-state&returnTo=${encodeURIComponent(returnTo)}">Approve sandbox access</a>`
      });
      return;
    }

    if (url.pathname === '/auth/callback') {
      const profile = { email: 'pilot@example.test', displayName: 'Wildfire Pilot' };
      let user = users.get(profile.email);
      if (!user) {
        user = { id: 'usr_mock_pilot', email: profile.email, displayName: profile.displayName, createdAt: new Date().toISOString() };
        users.set(profile.email, user);
      }
      const sessionId = `ses_${sessions.size + 1}`;
      sessions.set(sessionId, user.id);
      await route.fulfill({
        status: 302,
        headers: {
          location: url.searchParams.get('returnTo') ?? '/sandbox',
          'set-cookie': `cesium_sandbox_session=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Secure`
        },
        body: ''
      });
      return;
    }

    if (url.pathname === '/sandbox') {
      const userId = sessions.get(cookies.cesium_sandbox_session ?? '');
      const user = [...users.values()].find((candidate) => candidate.id === userId);
      if (!user) {
        await route.fulfill({ status: 302, headers: { location: '/login' }, body: '' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'text/html', body: sandboxShell(user) });
      return;
    }

    await route.fulfill({ status: 404, body: 'not found' });
  });
}

test.beforeEach(() => {
  users.clear();
  sessions.clear();
});

test('login redirects through OAuth, auto-registers first-time users, and opens the San Diego sandbox', async ({ page }) => {
  await installMockOAuthApp(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in to the Cesium sandbox' })).toBeVisible();

  await page.getByRole('link', { name: 'Sign in with OAuth2' }).click();
  await expect(page.getByRole('heading', { name: 'Mock OAuth Provider' })).toBeVisible();

  await page.getByRole('button', { name: 'Approve sandbox access' }).click();
  await expect(page).toHaveURL('https://sandbox.test/sandbox');
  await expect(page.locator('#sandbox')).toHaveAttribute('data-authenticated', 'true');
  await expect(page.getByTestId('welcome')).toHaveText('Welcome Wildfire Pilot');
  await expect(page.locator('#globe')).toHaveAttribute('data-latitude', '32.7157');
  await expect(page.locator('#globe')).toHaveAttribute('data-longitude', '-117.1611');
  expect(users).toHaveSize(1);
});

test('protected sandbox content redirects signed-out users back to login', async ({ page }) => {
  await installMockOAuthApp(page);

  await page.goto('/sandbox');
  await expect(page).toHaveURL('https://sandbox.test/login');
  await expect(page.getByRole('link', { name: 'Sign in with OAuth2' })).toBeVisible();
});
