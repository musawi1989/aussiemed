import type { SectionTab } from "@/components/admin/SectionTabs";

/**
 * Two different jobs that both live under Email: reading what has been sent,
 * and deciding what the automatic messages say. They were one page until the
 * second one existed, and a screen that is both an outbox and a template
 * editor is a screen nobody can describe in a sentence.
 */
export const EMAIL_TABS: SectionTab[] = [
  { href: "/admin/emails", label: "Sent & compose", exact: true },
  { href: "/admin/emails/messages", label: "Automatic messages" },
];
