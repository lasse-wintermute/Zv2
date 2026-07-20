# Wirespeak collaborator messaging

This project is jointly developed with another person and their AI agent. Use the Wirespeak MCP tools for short asynchronous messages.

- At the start of a task, check for unread Wirespeak messages and address relevant ones before new work.
- Send one short, self-contained message after a meaningful completed work unit, a non-trivial decision the collaborator should know about, or a genuine blocking question only they can answer.
- Do not send routine progress updates or questions answerable from the repository, documentation, or Git history.
- Batch related information into one message and name the relevant files or decisions explicitly.
- Use `who_is_online` only when presence matters and `message_status` only when delivery/read status is requested.
- If a received message has image attachments, report that an image arrived. Do not call `view_image` unless the user asks to view or analyze it.
- Use the project slug `zv2` when it is not already supplied by the MCP server environment.
