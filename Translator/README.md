# Language Translator

A small web translation tool with a source text box, source and target language selectors, API translation, copy, swap, and text-to-speech controls.

## Run as a Static Page

Open `index.html` in a browser. When no local backend is running, the app uses a Google Translate web endpoint from the browser.

## Optional Microsoft Translator Backend

If Node.js is installed, you can route translation through Microsoft Translator from a local backend so the Azure key stays out of browser code.

1. Copy `.env.example` to `.env`.
2. Add your Azure AI Translator key. Add `AZURE_TRANSLATOR_REGION` if your resource is regional or multi-service.
3. Start the app:

```powershell
node server.js
```

4. Open `http://localhost:3000`.

The backend keeps the API key out of the browser and sends translation requests to Microsoft Translator's REST API.
