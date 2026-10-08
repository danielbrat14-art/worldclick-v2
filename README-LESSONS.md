# WordClick lessons, phrases and speaking

The active portal runs on the existing ChatGPT Site with dispatch-owned identity and D1. Render remains an entrance redirect. The optional Google/Supabase adapter does not implement the new lesson APIs.

## Use

Sign in and open **Moje lekcje**, add a date/topic, and paste your Preply notes. Save the lesson, then add English phrases, Polish meanings and optional examples. Phrases can be edited, listened to, copied into the existing vocabulary library or reviewed within their lesson. **Moje zwroty** searches and filters all lesson phrases. Notes can open in the interactive reader.

**Powtórki z lekcji** prompts with the Polish meaning, reveals the English answer, and saves the user's SM-2 self-assessment and next review date. New and due phrases are selected by default; all phrases can be practised by disabling that filter.

**Tryb mówienia** uses questions from the notes and prompts to apply the lesson phrases. Users can write their own question, listen to it and record a maximum two-minute answer. Recordings remain temporary browser blobs, are revoked when leaving the activity and are not uploaded or stored in D1. Browser speech recognition is optional and off by default, may send audio to the browser vendor's service, and can be unavailable. Manual text entry remains available. Only explicitly saved text answers persist (latest 20 per lesson). This is self-practice, not an AI assessment of pronunciation or grammar.

## Data and compatibility

The appended `0001_zippy_steve_rogers` migration adds `lessons` and a user index without touching the existing vocabulary. Each API query scopes by the verified per-Site user ID. Guests and cross-origin writes are rejected. Updates/deletes use an expected revision so concurrent devices cannot silently overwrite each other. Notes and phrases are rendered as text, not HTML. Limits: 100 lessons/account, 100 phrases/lesson, 20,000 note characters and 55 KB total normalized lesson data. No production seed/backfill is used.

The previous Site version 7/source `51d02ee895b3fe5d0a0a195a5b7388515cb3dbe0` can be republished to roll back the interface. Leave the additive lessons table in place when rolling back; the old Worker ignores it. Do not delete the vocabulary database or recreate the Site/auth client.

## Development checks

Use Node 24 (built-in SQLite) and `npm ci`, then:

```sh
npm run build
npm run test:lessons
node scripts/verify.mjs
node scripts/verify-difficulty.mjs
node scripts/verify-context.mjs
node scripts/verify-translation-recovery.mjs
```

Generate later schema additions with `npm run db:generate`; never edit applied SQL or existing snapshots. `.openai/hosting.example.json` supports local builds without a Site identity. Real publication uses the existing owner's `.openai/hosting.json` through the Sites source helper and native publishing tools. This Worker must remain behind the trusted Sites dispatcher: client-supplied identity headers are not authentication on an arbitrary directly exposed server.

Checks use temporary SQLite, a network-disabled DOM harness and mocked microphone/speech APIs. They do not read or modify production users. Visual browser QA and real microphone/speech-service validation were unavailable in the build environment and must not be described as passed.
