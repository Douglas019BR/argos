# Security policy

## Supported versions

Security fixes are applied to the latest release tag and `main`.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository (the **Security**
tab → **Report a vulnerability**). Do not open a public issue for a security
problem, and do not include credentials in a report.

Useful details: affected version or commit, impact, reproduction steps, and any
relevant log lines with secrets removed.

## What to report

- Leaked credentials, WhatsApp session files, or group identifiers in tracked files.
- Remote code execution, path traversal, or injection through feed content.
- Anything that could expose a linked WhatsApp account or its messages.

## Scope note

Argos uses Baileys with a personal WhatsApp account. Automating a personal
account may violate WhatsApp's Terms of Service; use a dedicated number and keep
message volume low. This is an operational risk, not a vulnerability in this
repository.
