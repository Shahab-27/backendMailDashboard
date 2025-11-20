# SMTP Configuration

Set the following environment variables before starting the backend API:

- `SMTP_HOST` – e.g. `smtp.gmail.com` or `smtp.office365.com`
- `SMTP_PORT` – usually `465` for SSL or `587` for STARTTLS
- `SMTP_SECURE` – `true` when using port `465`, otherwise `false`
- `SMTP_USER` – the mailbox username (full email address for Gmail/Outlook)
- `SMTP_PASS` – the SMTP password or app password/token
- `SMTP_FROM` – optional friendly `From` header, defaults to `SMTP_USER`

Example using a Gmail app password:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your.address@gmail.com
SMTP_PASS=abc123examplepass
SMTP_FROM="Modern Mail Dashboard <your.address@gmail.com>"
```

With Outlook/Office365 you typically use:

```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
```

> Remember to also set `MONGO_URI`, `MONGO_DB`, `JWT_SECRET`, and `PORT` as required by the rest of the backend.


