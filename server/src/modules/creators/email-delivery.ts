import nodemailer from "nodemailer";
import { AppError } from "../../shared/errors/app-error.js";

type AuthEmail = { to: string; subject: string; text: string; html: string };
type EmailPurpose = "verification" | "password_reset";
const testMessages: AuthEmail[] = [];

function smtpConfiguration() {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  const publicAppUrl = process.env.PUBLIC_APP_URL?.trim();
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!host || !from || !publicAppUrl || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new AppError(503, "EMAIL_DELIVERY_UNAVAILABLE", "Email delivery is temporarily unavailable");
  }
  let appUrl: URL;
  try {
    appUrl = new URL(publicAppUrl);
  } catch {
    throw new AppError(503, "EMAIL_DELIVERY_UNAVAILABLE", "Email delivery is temporarily unavailable");
  }
  if (!new Set(["http:", "https:"]).has(appUrl.protocol) || (process.env.NODE_ENV === "production" && appUrl.protocol !== "https:") || appUrl.username || appUrl.password) {
    throw new AppError(503, "EMAIL_DELIVERY_UNAVAILABLE", "Email delivery is temporarily unavailable");
  }
  const username = process.env.SMTP_USERNAME?.trim();
  if (Boolean(username) !== Boolean(process.env.SMTP_PASSWORD)) {
    throw new AppError(503, "EMAIL_DELIVERY_UNAVAILABLE", "Email delivery is temporarily unavailable");
  }
  return {
    host,
    from,
    appUrl: appUrl.origin,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    requireTLS: process.env.SMTP_REQUIRE_TLS !== "false",
    user: username,
    pass: process.env.SMTP_PASSWORD,
  };
}

function verificationEmail(token: string, appUrl: string): AuthEmail {
  const link = `${appUrl}/verify-email?token=${encodeURIComponent(token)}`;
  return {
    to: "",
    subject: "Verify your LiveOrder seller account",
    text: `Verify your email address to activate your LiveOrder seller account: ${link}\nThis link expires in 24 hours. If you did not request this, you can ignore this message.`,
    html: `<p>Verify your email address to activate your LiveOrder seller account.</p><p><a href="${link}">Verify email address</a></p><p>This link expires in 24 hours. If you did not request this, you can ignore this message.</p>`,
  };
}

function resetEmail(token: string, appUrl: string): AuthEmail {
  const link = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  return {
    to: "",
    subject: "Reset your LiveOrder password",
    text: `Reset your LiveOrder password: ${link}\nThis link expires in one hour. If you did not request this, you can ignore this message.`,
    html: `<p>Reset your LiveOrder password using the link below.</p><p><a href="${link}">Reset password</a></p><p>This link expires in one hour. If you did not request this, you can ignore this message.</p>`,
  };
}

async function deliver(
  to: string,
  purpose: EmailPurpose,
  makeEmail: (token: string, appUrl: string) => AuthEmail,
  token: string,
) {
  if (process.env.NODE_ENV === "test") {
    const message = makeEmail(token, "http://localhost:5173");
    testMessages.push({ ...message, to });
    return;
  }

  const config = smtpConfiguration();
  const message = makeEmail(token, config.appUrl);
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: config.requireTLS,
    ...(config.user && { auth: { user: config.user, pass: config.pass ?? "" } }),
  });
  try {
    await transport.sendMail({ from: config.from, ...message, to });
  } catch (error) {
    const metadata = typeof error === "object" && error !== null
      ? error as { code?: unknown; command?: unknown; responseCode?: unknown }
      : {};
    console.error(JSON.stringify({
      level: "error",
      event: "transactional_email_delivery_failed",
      purpose,
      ...(typeof metadata.code === "string" && /^[A-Z0-9_-]{1,32}$/i.test(metadata.code)
        ? { transportCode: metadata.code }
        : {}),
      ...(typeof metadata.command === "string" && /^[A-Z0-9_-]{1,32}$/i.test(metadata.command)
        ? { smtpCommand: metadata.command }
        : {}),
      ...(typeof metadata.responseCode === "number" && Number.isInteger(metadata.responseCode)
        ? { smtpResponseCode: metadata.responseCode }
        : {}),
    }));
    throw new AppError(503, "EMAIL_DELIVERY_UNAVAILABLE", "Email delivery is temporarily unavailable");
  } finally {
    transport.close();
  }
}

export function assertEmailDeliveryConfigured() {
  if (process.env.NODE_ENV !== "test") smtpConfiguration();
}

export function sendVerificationEmail(to: string, token: string) {
  return deliver(to, "verification", verificationEmail, token);
}

export function sendPasswordResetEmail(to: string, token: string) {
  return deliver(to, "password_reset", resetEmail, token);
}

export function getTestAuthEmails() {
  if (process.env.NODE_ENV !== "test") throw new Error("Test email capture is only available in tests");
  return [...testMessages];
}

export function clearTestAuthEmails() {
  if (process.env.NODE_ENV === "test") testMessages.length = 0;
}
