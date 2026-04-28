# Google Authentication

This project currently uses Google Cloud Application Default Credentials for local Google API authentication.

Set it up with:

```bash
gcloud auth application-default login
```

That command stores local ADC credentials under your user config, and the deck CLI uses `gcloud auth application-default print-access-token` to get short-lived access tokens when calling Google APIs.

This same setup is used for:

- Google Text-to-Speech
- Google Translate

Make sure the relevant APIs are enabled in the Google Cloud project you are using:

- Cloud Text-to-Speech API
- Cloud Translation API

If billing/quota project selection is needed, set the ADC quota project with `gcloud` or provide `GOOGLE_CLOUD_QUOTA_PROJECT`. The project-specific overrides are also supported, but the normal local setup does not require them.
