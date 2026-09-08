import { test } from "node:test";
import assert from "node:assert/strict";
import { safeEmailHtml, fillEmailHtml, emailHtmlFromText, validateAttachments } from "./email-html.ts";
import { composeEmailMime } from "./email-mime.ts";

test("email HTML strips executable markup, unsafe URLs and tracking styles", () => {
  const html = safeEmailHtml('<script>alert(1)</script><p onclick="evil()" style="color:#ff0000;background:url(https://x.test)">Hello</p><a href="javascript:evil()">link</a><iframe src="https://x.test"></iframe>');
  assert.equal(html, '<p style="color:#ff0000">Hello</p><a>link</a>');
});
test("email placeholders cannot introduce markup or unsafe links", () => {
  const html = fillEmailHtml('<p>{{name}}</p><a href="{{url}}">Pay</a>', { name: '<img src=x onerror=evil()>', url: 'javascript:evil()' });
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('href='));
  assert.ok(emailHtmlFromText('<hello> & goodbye').includes('&lt;hello&gt; &amp; goodbye'));
});
test("attachments enforce count, total bytes, type and filename limits", () => {
  const valid = { fileName: 'packing-list.pdf', contentType: 'application/pdf', bytes: new Uint8Array([1,2,3]) };
  assert.equal(validateAttachments([valid]), null);
  for (const fileName of ['../secret.pdf', 'folder\\a.pdf', 'bad\nname.pdf', 'invoice.exe']) assert.ok(validateAttachments([{ ...valid, fileName }]));
  assert.ok(validateAttachments(Array(6).fill(valid)));
  assert.ok(validateAttachments([{ ...valid, bytes: new Uint8Array(10 * 1024 * 1024 + 1) }]));
  assert.ok(validateAttachments([{ ...valid, bytes: new Uint8Array() }]));
});
test("outbox MIME contains both email versions and the attachment bytes", async () => {
  const mime = (await composeEmailMime({ to: 'qa@example.test', kind: 'OrderConfirmation', subject: 'QA message', text: 'Plain message', html: '<p>HTML message</p>', attachments: [{ fileName: 'note.txt', contentType: 'text/plain', bytes: new TextEncoder().encode('QA attachment') }] }, 'sender@example.test')).toString();
  assert.match(mime, /multipart\/mixed/);
  assert.match(mime, /multipart\/alternative/);
  assert.match(mime, /Plain message/);
  assert.match(mime, /HTML message/);
  assert.match(mime, /filename=note.txt/);
  assert.ok(mime.includes(Buffer.from('QA attachment').toString('base64')));
});
