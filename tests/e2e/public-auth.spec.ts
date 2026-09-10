import { expect, test } from '@playwright/test';
import { mockApp, user } from './support/app';

test('public navigation exposes marketing, about, sign in, and sign up', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /sign in/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /about/i })).toHaveAttribute('href', '/about');
  await page.goto('/about');
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: /sign up/i })).toBeVisible();
});

test('local sign in stores the session, remembers email, and opens dashboard', async ({ page }) => {
  await mockApp(page);
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'header.eyJleHAiOjQxMDI0NDQ4MDB9.signature', user }),
    }),
  );

  await page.goto('/signin');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('CorrectHorseBatteryStaple');
  await page.getByLabel('Remember me').check();
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  await expect(page).toHaveURL(/\/app\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('rememberedEmail'))).toBe(user.email);
});

test('invalid credentials remain on sign in and show an error', async ({ page }) => {
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Unauthorized"}' }),
  );
  await page.goto('/signin');
  await page.getByLabel('Email').fill('wrong@example.test');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByText('Invalid email or password.')).toBeVisible();
  await expect(page).toHaveURL(/\/signin$/);
});

test('local registration validates password and creates a session', async ({ page }) => {
  await mockApp(page);
  await page.route('**/api/auth/register', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ accessToken: 'header.eyJleHAiOjQxMDI0NDQ4MDB9.signature', user }),
    }),
  );

  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Ada Admin');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
  await expect(page.getByLabel('Password')).toHaveAttribute('minlength', '8');
  expect(await page.getByLabel('Password').evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(false);

  await page.getByLabel('Password').fill('CorrectHorseBatteryStaple');
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/);
});

test('duplicate registration shows a specific conflict message', async ({ page }) => {
  await page.route('**/api/auth/register', (route) =>
    route.fulfill({ status: 409, contentType: 'application/json', body: '{"message":"Email exists"}' }),
  );
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Ada Admin');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('CorrectHorseBatteryStaple');
  await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
  await expect(page.getByText('Email already registered.')).toBeVisible();
});

test('protected routes redirect an anonymous user to sign in', async ({ page }) => {
  await page.goto('/app/dashboard');
  await expect(page).toHaveURL(/\/signin$/);
});
