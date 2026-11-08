// Отправка писем (пока только «Восстановление пароля»).
// Работает через любой почтовый сервис по SMTP: настройки — в переменных SMTP_* (см. .env.example).
// Если SMTP не настроен: при разработке письмо печатается в консоль, на сервере — пишем ошибку в лог.
import nodemailer from "nodemailer";

type Mail = { to: string; subject: string; text: string; html: string };

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  if (!transport) {
    const port = Number(process.env.SMTP_PORT ?? 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465 — сразу шифрованное соединение, 587 — шифрование включается после подключения
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

export async function sendMail(mail: Mail) {
  const t = getTransport();
  if (!t || !process.env.MAIL_FROM) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`\n[почта не настроена — письмо для ${mail.to}]\n${mail.subject}\n${mail.text}\n`);
    } else {
      console.error("Почта не настроена (SMTP_HOST / MAIL_FROM): письмо не отправлено");
    }
    return;
  }
  await t.sendMail({ from: process.env.MAIL_FROM, ...mail });
}

// Адрес сайта для ссылок в письмах. Берём из настроек, а не из запроса,
// чтобы никто не смог подсунуть в письмо ссылку на чужой сайт.
export function appUrl() {
  return (process.env.APP_URL ?? "https://sellcore.app").replace(/\/+$/, "");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// Простое письмо в стиле SellCore: заголовок, текст, кнопка.
export function layout(title: string, lines: string[], button?: { label: string; url: string }) {
  const p = lines.map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join("");
  const btn = button
    ? `<p style="margin:20px 0"><a href="${esc(button.url)}" style="background:#2F6E7A;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">${esc(button.label)}</a></p>
       <p style="margin:0 0 12px;color:#5E6B70;font-size:13px">Если кнопка не нажимается, скопируйте ссылку в браузер:<br>${esc(button.url)}</p>`
    : "";
  return `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.5;color:#192B32;max-width:520px;margin:0 auto;padding:24px">
  <p style="font-family:Manrope,Arial,sans-serif;font-size:20px;font-weight:700;margin:0 0 20px">SellCore</p>
  <h2 style="font-family:Manrope,Arial,sans-serif;margin:0 0 16px">${esc(title)}</h2>${p}${btn}
  <p style="margin:24px 0 0;color:#5E6B70;font-size:13px">Это автоматическое письмо, отвечать на него не нужно.</p></div>`;
}
