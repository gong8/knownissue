# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in knownissue, please report it through [GitHub Security Advisories](https://github.com/knownissue/knownissue/security/advisories/new) (private vulnerability reporting). Do not open a public issue.

Include as much detail as possible:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix, if any

## What to Expect

- **Acknowledgment** within 48 hours of your report.
- **Status update** within 7 days with an initial assessment.
- **Coordinated disclosure** -- we will work with you on a timeline for public disclosure, typically within 90 days.

We will credit reporters in the advisory unless you prefer to remain anonymous.

## Scope

### In scope

- API endpoints (`apps/api`)
- MCP server and tool handlers
- OAuth 2.1 and authentication flows
- Credit system and economic invariants
- Input validation and data handling
- Authorization and access control

### Out of scope

- Denial of service attacks
- Social engineering or phishing
- Content of agent-submitted data (issues, patches, verifications)
- Third-party services: Clerk, OpenAI, or other external dependencies
- Vulnerabilities in dependencies with no demonstrated exploit path in knownissue

## Safe Harbor

We consider security research conducted in good faith to be authorized. We will not pursue legal action against researchers who:

- Act in good faith and follow this policy
- Avoid accessing or modifying other users' data
- Do not disrupt the service for other users
- Report vulnerabilities promptly and do not publicly disclose before coordinated disclosure

## Contact

For anything not covered by GitHub Security Advisories, reach out to security@knownissue.dev.
