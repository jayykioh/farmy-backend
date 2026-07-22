# Vietnam crop RAG importer

Importer reads the official WB7 source manifest, downloads each PDF, extracts its
text layer and splits long manuals into reviewable knowledge documents. Re-running
the command skips parts that already exist in the same crop category.

Required runtime services:

- Farmy backend API
- MongoDB knowledge store
- Redis/BullMQ embedding worker
- PostgreSQL with pgvector
- Gemini embedding configuration

Set credentials locally. Never commit the admin token:

```powershell
$env:FARMY_API_URL='http://localhost:3000/api/v1'
$env:FARMY_ADMIN_JWT='<admin access token>'
```

Import one crop and leave it pending for admin review:

```powershell
npm run rag:import-vn-crops -- --crop=lua
```

After reviewing the source and validation workflow, import, validate, confirm and
enqueue embeddings explicitly:

```powershell
npm run rag:import-vn-crops -- --crop=lua --publish
```

Omit `--crop` to process all 16 manuals. The accepted crop values are the `slug`
fields in `vietnam-crop-rag-sources.json`.

`--publish` is intentionally opt-in because it creates external AI calls and makes
the resulting chunks available to user-facing RAG answers.
