import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type { EmailMessage } from "./email-message";

export function composeEmailMime(message: EmailMessage, from: string) {
  return new MailComposer({
    from: { name: "AussieMed", address: from }, to: message.to,
    subject: message.subject, text: message.text, html: message.html,
    disableFileAccess: true, disableUrlAccess: true,
    attachments: message.attachments?.map(file => ({ filename: file.fileName, contentType: file.contentType, content: Buffer.from(file.bytes) })),
  }).compile().build();
}
