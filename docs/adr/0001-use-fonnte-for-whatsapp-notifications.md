# Use Fonnte for WhatsApp notifications

SI-TAMU will send visitor notifications through Fonnte using a dedicated organization-owned WhatsApp number. The team chose Fonnte for its lower operational cost and simpler third-party API integration, accepting that it automates a WhatsApp Web session rather than using Meta's official Cloud API or an official BSP; delivery references, bounded retries, visible failures, and manual retry controls are therefore required.

## Consequences

- Credentials stay in Apps Script Properties and are never exposed to public browser code.
- Failed delivery retries at most three times over 30 minutes, then requires a manual Admin retry.
- Incoming replies remain ordinary human conversations and never change workflow state automatically.
- The provider can be replaced later behind a notification-service boundary if reliability or policy requirements change.
