## Wirespeak — collaborator messaging

This project is jointly developed with another person who also runs Claude
Code here. Wirespeak MCP tools let you pass short async messages to them.

**When to proactively call `send_message`:**
- You made a non-trivial decision they'd want to know about (chose a library,
  changed an approach, picked a schema design) — send a one-line summary.
- You have a genuine blocking question only they can answer (a product
  decision, a credential you don't have, an ambiguous requirement).
- You finished a meaningful chunk of work they asked about or are waiting on.

**When NOT to send a message:**
- Routine, expected progress ("still working on X") — don't narrate.
- Anything answerable from the code/docs/git history yourself — check first.
- More than one message per logical unit of work — batch related updates
  into a single message rather than sending several in a row.

Keep messages short (1-3 sentences) and self-contained — the recipient may
read it hours later with no memory of this conversation's context, so name
files/decisions explicitly rather than saying "the thing we discussed."

At the start of a session, if Wirespeak surfaced unread messages above, read
and address them before starting new work if they're relevant to the task
at hand.

You can also call `check_messages` explicitly if the user asks whether
there's anything from the other collaborator, `who_is_online` if the
user asks whether they're currently around, and `message_status` if the
user wants to know whether a message they sent was read yet.
