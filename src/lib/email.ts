import "server-only";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM ?? "noreply@example.com";

// Single shared client. If RESEND_API_KEY is unset (e.g. local dev), `resend`
// is null and sends are skipped with a warning — the token still exists, so the
// flow is testable by reading the URL from the server log.
const resend = apiKey ? new Resend(apiKey) : null;

// Escape interpolated values before embedding in email HTML. `name` is
// owner-supplied free text and the URLs derive from the (attacker-influenceable)
// Host header, so neither can be trusted as literal HTML.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function send(to: string, subject: string, html: string) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY unset — skipping send to ${to}: ${subject}`);
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    // A failed email must not blow up the server action — the token row exists
    // and the owner/user can retry. Log and move on.
    console.error(`[email] failed to send to ${to}:`, err);
  }
}

export async function sendInviteEmail(to: string, name: string, inviteUrl: string) {
  await send(
    to,
    "GymPass — hesabınızı aktivləşdirin",
    `<p>Salam ${esc(name)},</p>
     <p>Sizə GymPass hesabı yaradıldı. Şifrənizi təyin etmək üçün aşağıdakı linkə keçin (link 48 saat etibarlıdır):</p>
     <p><a href="${esc(inviteUrl)}">${esc(inviteUrl)}</a></p>`
  );
}

export async function sendResetEmail(to: string, resetUrl: string) {
  await send(
    to,
    "GymPass — şifrə sıfırlama",
    `<p>Şifrənizi sıfırlamaq üçün aşağıdakı linkə keçin (link 1 saat etibarlıdır):</p>
     <p><a href="${esc(resetUrl)}">${esc(resetUrl)}</a></p>
     <p>Bu sorğunu siz etməmisinizsə, bu emaili nəzərə almayın.</p>`
  );
}
