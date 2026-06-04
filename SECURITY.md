# Security Policy

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in this project, please report it responsibly.

### Do Not Open Public Issues

**Please do not open a public GitHub issue for security vulnerabilities.** This gives attackers information about the vulnerability before a fix is available.

### Report Privately

1. **GitHub Security Advisory:** Use GitHub's [private security advisory feature](https://github.com/pradeepmouli/skillit/security/advisories/new)
2. **Email:** pmouli@mac.com (for critical issues requiring immediate attention)
3. **Direct Contact:** Contact maintainers privately if needed

### Information to Include

When reporting a vulnerability, please include:

- **Description:** Clear explanation of the vulnerability
- **Location:** Specific file(s) and line number(s)
- **Severity:** Impact assessment (critical, high, medium, low)
- **Steps to Reproduce:** Detailed reproduction instructions
- **Proof of Concept:** Code or example demonstrating the issue
- **Suggested Fix:** If you have one (optional)

## Security Updates

### Notification

- Security fixes are released as soon as possible
- Critical vulnerabilities may be released outside normal release cycles
- Security advisories will be published on GitHub

### Supported Versions

| Version | Status | Security Updates |
| ------- | ------ | ---------------- |
| 1.x     | Active | Yes              |
| 0.x     | EOL    | No               |

## Dependency Security

We use:

- **Dependabot/Renovate:** Automated dependency updates
- **npm audit:** Regular security audits in CI/CD
- **GitHub Security:** Code scanning and secret scanning

### Keeping Dependencies Updated

- Run `pnpm audit` regularly
- Update dependencies with `pnpm update -r --latest`
- Review security advisories on dependencies

## Code Security Practices

### Best Practices We Follow

1. **Input Validation:** All inputs are validated
2. **Error Handling:** Errors are handled gracefully without exposing sensitive info
3. **Secrets Management:** No hardcoded secrets; use environment variables
4. **Dependency Management:** Keep dependencies minimal and updated
5. **Code Review:** All code is reviewed before merging

### Secure Development

When contributing:

- Never commit secrets, API keys, or credentials
- Use `.env.local` for local secrets (not committed)
- Validate and sanitize all user input
- Use parameterized queries for database operations
- Keep sensitive operations secure

## Security Scanning

We perform:

- **Static Analysis:** With oxlint
- **Dependency Scanning:** With Dependabot/Renovate
- **CodeQL:** GitHub's code scanning
- **Security Advisories:** GitHub security alerts

## Known Issues

As of the latest release, there are no known unresolved security vulnerabilities.

## Security Disclosure

We believe in responsible disclosure. Vulnerabilities disclosed to us are:

- Confirmed within 2-5 business days
- Fixed as soon as possible
- Credited to the reporter (unless they wish to remain anonymous)

## Safe Harbor

We appreciate security research conducted in good faith. This includes:

- Testing for vulnerabilities
- Reporting vulnerabilities
- Improving security measures

We will not take legal action against researchers who:

- Act in good faith
- Avoid privacy violations or data destruction
- Follow responsible disclosure practices
- Don't disclose vulnerabilities publicly before notification

## Questions?

- **Security Questions:** pmouli@mac.com
- **General Questions:** Open a discussion on GitHub
- **Bug Reports:** Open an issue with `security` label

---

Thank you for helping keep this project secure! 🔒
