import { expect, test, type Page } from "@playwright/test";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

// Personal mode opens without an app password (device-local).
const BACKUP_DIR = resolve("tmp/e2e-backup-dir");

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await rm(BACKUP_DIR, { recursive: true, force: true });
  await mkdir(BACKUP_DIR, { recursive: true });
});

async function openPersonal(page: Page, url = "./?mode=personal"): Promise<void> {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "健康记录" })).toBeVisible();
}

test("personal mode opens without password setup or unlock", async ({ page }) => {
  await openPersonal(page);
  await expect(page.getByRole("heading", { name: "设置恢复密码" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "个人档案已锁定" })).toHaveCount(0);
  await expect(page.locator("[data-lock-button]")).toHaveCount(0);
  await page.getByLabel("档案显示名").fill("E2E Device Local");
  await page.getByLabel("我确认以上显示名对应该档案所属人").check();
  const oldForm = await page.$("#profile-form");
  await page.getByRole("button", { name: "保存档案身份" }).click();
  await page.waitForFunction((form) => !form?.isConnected, oldForm);
  await expect(page.getByLabel("档案显示名")).toHaveValue("E2E Device Local");

  // Reload stays open — no unlock wall.
  await page.reload();
  await expect(page.getByRole("heading", { name: "健康记录" })).toBeVisible();
  await expect(page.getByLabel("档案显示名")).toHaveValue("E2E Device Local");
});

test("chooser describes device-local personal mode", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByText("无需 App 密码")).toBeVisible();
});
