/**
 * Utility functions for interacting with Google Gmail API
 */

function createRawEmail(to: string, subject: string, body: string): string {
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  ];
  const email = emailLines.join('\r\n');
  return btoa(unescape(encodeURIComponent(email)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface SendGmailOptions {
  to: string;
  subject: string;
  bodyHtml: string;
  accessToken: string;
}

export async function sendGmailEmail({ to, subject, bodyHtml, accessToken }: SendGmailOptions) {
  if (!accessToken) {
    throw new Error("Token de acesso do Google/Gmail não encontrado. Faça login com o Google.");
  }

  const raw = createRawEmail(to, subject, bodyHtml);

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    const message = errorJson?.error?.message || response.statusText || "Erro ao enviar e-mail via Gmail API";
    throw new Error(message);
  }

  return await response.json();
}
