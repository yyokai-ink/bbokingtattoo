export interface Mail { to: string; subject: string; text: string }

/**
 * SMTP when SMTP_HOST is set; otherwise (development) the mail is printed to the server console so you can
 * click verification / reset links without a mail server. In production without SMTP the mail is dropped
 * and NOTHING (links, tokens) is logged.
 */
export async function sendEmail(mail: Mail): Promise<void> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    if (process.env.NODE_ENV === 'production') console.warn('[mail] SMTP_HOST is not configured — e-mail dropped');
    else console.info(`\n[mail:dev] to=${mail.to}\nsubject=${mail.subject}\n${mail.text}\n`);
    return;
  }
  const nodemailer = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host, port: Number(process.env.SMTP_PORT ?? 587), secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  await transport.sendMail({ from: process.env.EMAIL_FROM ?? 'Lumera <no-reply@example.com>', to: mail.to, subject: mail.subject, text: mail.text });
}
