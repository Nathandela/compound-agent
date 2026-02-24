# Security Policy

## Supported Versions

Only the latest release line receives security updates.

| Version | Supported          |
|---------|--------------------|
| 1.4.x   | Yes                |
| < 1.4   | No                 |

If you are running an older version, please upgrade to the latest release before
reporting a vulnerability.

## Reporting a Vulnerability

If you discover a security vulnerability in compound-agent, please report it
responsibly via email.

**Contact**: nathan.delacretaz@gmail.com
**Subject line**: `SECURITY: compound-agent`

Please include the following in your report:

- A clear description of the vulnerability
- Steps to reproduce the issue
- The version(s) of compound-agent affected
- Any potential impact assessment

**Do not** open a public GitHub issue for security vulnerabilities.

## Response Timeline

- **Acknowledgment**: Within 72 hours of receiving your report
- **Fix target**: Within 30 days of confirmed vulnerability
- **Status updates**: You will receive periodic updates on the progress of the fix

If you have not received an acknowledgment within 72 hours, please resend the
email in case the original was missed.

## What Qualifies as a Security Issue

The following are considered valid security reports:

- SQL injection in the local SQLite database
- Credential or secret exposure (tokens, passwords, API keys)
- Arbitrary code execution through crafted input
- Dependency vulnerabilities that are exploitable in this project's context

## What Does NOT Qualify

The following should be reported as regular issues, not security vulnerabilities:

- General bugs or unexpected behavior
- Feature requests or enhancement suggestions
- Performance issues or resource usage concerns
- Vulnerabilities in dependencies that are not exploitable in this context

Please use the standard GitHub issue tracker for these.

## Disclosure Policy

This project follows a coordinated disclosure model:

1. The reporter sends a private vulnerability report via email.
2. The maintainer acknowledges and works on a fix within the response timeline.
3. A fix is released and the reporter is credited (unless anonymity is requested).
4. Public disclosure may occur after the fix is released or after a **90-day
   window** from the initial report, whichever comes first.

Please do not disclose the vulnerability publicly before the 90-day window has
elapsed or a fix has been released.

## Scope and Attack Surface

Compound-agent is a local CLI tool. It does not make network requests during
normal operation, with the sole exception of downloading the embedding model on
first use. All data (lessons, SQLite database, configuration) is stored locally
on the user's machine.

As a result, the attack surface is limited to:

- Local file system access and SQLite operations
- Processing of user-supplied input through the CLI
- Dependencies pulled from npm

Remote attack vectors such as server-side injection or network-based exploits
are not applicable to this tool's architecture.
