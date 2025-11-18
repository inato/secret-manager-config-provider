---
"@inato/secret-manager-config-provider": patch
---

fix: whenever an Error happens when trying to resolve a secret, its fallbacks on .env or the JSON file should work fine now
