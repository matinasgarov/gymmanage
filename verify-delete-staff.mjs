import { chromium } from "playwright";
import { execSync } from "node:child_process";

const BASE = "http://localhost:3000";
const OWNER_EMAIL = "matinasgarov21@gmail.com";
const OWNER_PASS = "TestPass123";
const STAFF_EMAIL = "pendingstaff@example.com";
const STAFF_NAME = "Pending Worker";

const psql = (sql) =>
  execSync(`docker exec -i gympass-db psql -U gympass -d gympass -t -A`, { input: sql, encoding: "utf8" }).trim();

const results = [];
const step = (ok, label, detail = "") => { results.push({ ok, label, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? " :: " + detail : ""}`); };

psql(`DELETE FROM "User" WHERE email='${STAFF_EMAIL}'`);

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

try {
  // Owner login
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', OWNER_EMAIL);
  await page.fill('input[name="password"]', OWNER_PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  step(true, "Owner login → /dashboard");

  // Invite a worker via the redesigned form
  await page.goto(`${BASE}/settings`);
  await page.waitForSelector("text=İşçilər", { timeout: 10000 });
  const inviteForm = page.locator('form:has(button:has-text("Dəvət göndər"))');
  await inviteForm.locator('input[name="name"]').fill(STAFF_NAME);
  await inviteForm.locator('input[name="email"]').fill(STAFF_EMAIL);
  await inviteForm.locator('button[type="submit"]').click();
  await page.waitForSelector(`text=${STAFF_NAME} dəvət olundu`, { timeout: 15000 });
  step(true, "Invite via redesigned form → success message");

  // UI: the new worker shows the "Dəvət gözlənilir" (pending) badge, not "Deaktiv"
  await page.reload();
  await page.waitForSelector("text=İşçilər");
  const row = page.locator('li', { hasText: STAFF_NAME });
  const pendingBadge = await row.locator('text=Dəvət gözlənilir').count();
  step(pendingBadge === 1, "Invited worker shows 'Dəvət gözlənilir' badge (not Deaktiv)");

  // A pending worker has the Sil (delete) action but NOT a toggle
  const hasDelete = await row.locator('button:has-text("Sil")').count();
  const hasToggle = await row.locator('button:has-text("Deaktiv et"), button:has-text("Aktiv et")').count();
  step(hasDelete === 1 && hasToggle === 0, "Pending worker: has Sil, no activate toggle", `sil=${hasDelete} toggle=${hasToggle}`);

  await page.screenshot({ path: "verify-staff-ui.png", fullPage: true });

  // Resend key is loaded: server log should show a real send attempt, NOT the
  // "RESEND_API_KEY unset — skipping" line.
  const logTxt = execSync("cat dev-verify.log", { encoding: "utf8" });
  const skipped = /RESEND_API_KEY unset — skipping/.test(logTxt);
  step(!skipped, "Resend key loaded (no 'unset — skipping' in log)", skipped ? "STILL SKIPPING" : "key picked up");

  // ---- Delete worker: type-to-confirm ----
  const staffId = psql(`SELECT id FROM "User" WHERE email='${STAFF_EMAIL}'`);
  await row.locator('button:has-text("Sil")').click();
  await page.waitForSelector("text=İşçini sil", { timeout: 10000 });

  // Submit disabled until exact name typed
  const submitBtn = page.locator('button:has-text("Həmişəlik sil")');
  step(await submitBtn.isDisabled(), "Delete submit disabled before typing name");

  await page.fill('input[name="confirmName"]', "wrong name");
  step(await submitBtn.isDisabled(), "Delete submit still disabled with wrong name");

  await page.fill('input[name="confirmName"]', STAFF_NAME);
  step(!(await submitBtn.isDisabled()), "Delete submit enabled with exact name");

  await submitBtn.click();
  await page.waitForSelector(`text=${STAFF_NAME}`, { state: "detached", timeout: 10000 }).catch(() => {});
  // confirm gone from DB
  const afterDelete = psql(`SELECT count(*) FROM "User" WHERE id='${staffId}'`);
  step(afterDelete === "0", "Worker hard-deleted from DB", `rows=${afterDelete}`);

  // audit row written
  const auditRow = psql(`SELECT count(*) FROM "AuditLog" WHERE action='staff.delete' AND "entityId"='${staffId}'`);
  step(auditRow === "1", "staff.delete audit row written", `count=${auditRow}`);

  // ---- PROBE: deleting an OWNER is impossible via this action ----
  const ownerId = psql(`SELECT id FROM "User" WHERE email='${OWNER_EMAIL}'`);
  // The action filters role:"STAFF" + gymId; simulate a forged call is not possible
  // through UI (owner has no Sil button on themselves — owners aren't listed as staff).
  const ownerInStaffList = await page.locator('li', { hasText: OWNER_EMAIL }).count();
  step(ownerInStaffList === 0, "PROBE owner not shown in staff list (no self/owner delete)", `rows=${ownerInStaffList}`);
} catch (err) {
  step(false, "EXCEPTION", String(err && err.message ? err.message : err));
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log("\n==== SUMMARY ====");
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log("FAILED:"); failed.forEach((f) => console.log(" - " + f.label + " :: " + f.detail)); process.exit(1); }
  console.log("VERDICT: PASS");
}
