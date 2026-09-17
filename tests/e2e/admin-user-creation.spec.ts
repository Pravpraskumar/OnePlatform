import { expect, test } from '@playwright/test';
import { setupAuthenticatedApp } from './support/app';

test('global administrator creates a local user without access assignments', async ({ page }) => {
  await setupAuthenticatedApp(page);
  let createdUser: Record<string, unknown> | null = null;

  await page.route('**/api/users', async (route) => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON();
      createdUser = {
        id: 'user-new',
        firstName: input.firstName,
        lastName: input.lastName,
        displayName: `${input.firstName} ${input.lastName}`,
        email: input.email,
        username: input.username,
        status: input.status,
        hasPassword: true,
        isB2c: false,
        lastSignedInAt: null,
        createdAt: '2026-09-10T00:00:00.000Z',
        globalRoles: [],
        roleAssignments: [],
        organisations: [],
      };
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(createdUser) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(createdUser ? [createdUser] : []) });
  });

  await page.goto('/admin/user-assignments');
  await expect(page.getByRole('button', { name: 'New user' })).toHaveCount(0);

  await page.goto('/admin/users');
  await page.getByRole('button', { name: 'New user' }).click();

  await expect(page.getByRole('dialog', { name: 'New user' })).toBeVisible();
  await expect(page.getByText('Roles and organisation access are assigned separately.')).toBeVisible();
  await page.getByLabel('First name').fill('Grace');
  await page.getByLabel('Last name').fill('Hopper');
  await page.getByLabel('Email').fill('grace.hopper@example.test');
  await page.getByLabel('Username').fill('grace.hopper');
  await page.getByLabel('Initial password').fill('Temporary123!');
  await expect(page.getByLabel('Initial password')).toHaveAttribute('type', 'password');

  const createRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/users'));
  await page.getByRole('button', { name: 'Create user' }).click();

  expect((await createRequest).postDataJSON()).toEqual({
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace.hopper@example.test',
    username: 'grace.hopper',
    password: 'Temporary123!',
    status: 'active',
  });
  await expect(page.getByRole('dialog', { name: 'New user' })).toHaveCount(0);
  await expect(page.getByText('Grace Hopper')).toBeVisible();
  await expect(page.getByText('None')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'User created successfully.' })).toBeVisible();
});