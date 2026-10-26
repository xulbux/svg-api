# Security Policy

## <a href="#reporting-a-vulnerability"><img src="https://svg.xul.is/icon/shield-alert?size=32&stroke=2" align="left" /></a>Reporting a Vulnerability

Please **do not open public issues** for security vulnerabilities in **SVG API** or [**svg.xul.is**](https://svg.xul.is). Report them privately via:

-   [**GitHub Private Vulnerability Reporting**](https://github.com/xulbux/svg-api/security/advisories/new) (*preferred*)
-   **Email:** [hi@xul.is](mailto:hi@xul.is)

Include a short description, impact, and minimal reproduction URLs (avoid automated flood testing against live `svg.xul.is`). Please allow reasonable time to release a fix before public disclosure (as a free open-source project, paid bug bounties are not offered).

<br>

## <a href="#scope"><img src="https://svg.xul.is/icon/target?size=32&stroke=2" align="left" /></a>Scope

-   **In Scope:** SVG/HTML XSS, open redirects bypassing `sanitizeRedirectUrl`, SSRF or path traversal in presets, cache poisoning, and CPU/memory DoS from crafted inputs.
-   **Out of Scope:** Third-party upstream rate limits or `5xx` errors, vulnerabilities in upstream dependencies or icon sets (report those directly to their maintainers), and headers on external sites embedding `svg.xul.is` images.
