// E-mails to shop owners: confirming their address and setting a new password. Sent through Resend
// (RESEND_API_KEY, MAIL_FROM – the sending domain must be verified in Resend). Without a key nothing is
// sent: the link is written to the server log, and the features that need e-mail stay switched off
// (no address check at sign-up, the forgotten-password page points to our contact e-mail instead).

export const mailEnabled = () => Boolean(process.env.RESEND_API_KEY);
const FROM = () => process.env.MAIL_FROM || "Sella <noreply@sella.chat>";

export async function sendMail({ to, subject, text, html }) {
  if (!mailEnabled()) {
    console.log(`[mail not sent – RESEND_API_KEY missing] to ${to}: ${subject}\n${text}`);
    return false;
  }
  const r = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", { // the URL is set only in tests
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM(), to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return true;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** A plain, readable e-mail with one button – the same look in every mail client. */
function layout({ lead, button, link, after }) {
  const html = `<!doctype html><html><body style="margin:0;background:#eef2f6;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#2f3133">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <p style="font-family:Georgia,serif;font-size:32px;margin:0 0 22px;color:#434445">Sella</p>
    <div style="background:#fff;border-radius:18px;padding:28px">
      ${lead.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.55">${esc(p)}</p>`).join("")}
      <p style="margin:22px 0"><a href="${esc(link)}" style="display:inline-block;background:#2f3133;color:#fff;text-decoration:none;font-weight:600;padding:13px 22px;border-radius:999px">${esc(button)}</a></p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#7b8188">${esc(after)}<br><a href="${esc(link)}" style="color:#7b8188;word-break:break-all">${esc(link)}</a></p>
    </div>
  </div></body></html>`;
  return { html, text: `${lead.join("\n\n")}\n\n${button}: ${link}\n\n${after}` };
}

const T = {
  cs: {
    verify: (shop) => ({
      subject: "Potvrďte svůj e-mail – Sella",
      lead: [`Dobrý den,`, `děkujeme, že jste si pro ${shop} vybrali Sellu. Potvrďte prosím, že tento e-mail patří vám – pak můžete zaplatit tarif a prodavačku spustit.`],
      button: "Potvrdit e-mail", after: "Odkaz platí 7 dní. Pokud jste se k Selle neregistrovali, e-mail ignorujte – účet bez potvrzení po čase smažeme.",
    }),
    reset: (shop) => ({
      subject: "Nové heslo do Selly",
      lead: [`Dobrý den,`, `někdo (nejspíš vy) požádal o nové heslo do přehledu obchodu ${shop}. Heslo nastavíte tímto odkazem.`],
      button: "Nastavit nové heslo", after: "Odkaz platí hodinu a funguje jen jednou. Pokud jste o nové heslo nežádali, e-mail ignorujte – vaše heslo zůstává beze změny.",
    }),
  },
  en: {
    verify: (shop) => ({
      subject: "Confirm your e-mail – Sella",
      lead: ["Hello,", `thank you for choosing Sella for ${shop}. Please confirm this e-mail address is yours – then you can pay for a plan and switch the assistant on.`],
      button: "Confirm e-mail", after: "The link is valid for 7 days. If you didn't sign up for Sella, ignore this e-mail – unconfirmed accounts are deleted after a while.",
    }),
    reset: (shop) => ({
      subject: "A new password for Sella",
      lead: ["Hello,", `someone (probably you) asked for a new password to the insights of ${shop}. Set it with this link.`],
      button: "Set a new password", after: "The link is valid for an hour and works once. If you didn't ask for a new password, ignore this e-mail – your password stays as it is.",
    }),
  },
};

/** kind = "verify" | "reset" */
export function sendAccountMail(kind, { to, shop, link, lang = "cs" }) {
  const m = T[lang === "en" ? "en" : "cs"][kind](shop);
  return sendMail({ to, subject: m.subject, ...layout({ lead: m.lead, button: m.button, link, after: m.after }) });
}
