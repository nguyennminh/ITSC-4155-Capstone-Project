# JobSwipe Autofill for Chrome

The extension works with the regular JobSwipe app. No demo server or Chrome
Web Store install is needed. It fills recognized fields on standard
Greenhouse-hosted application pages and leaves submission to you.

## Install and connect

1. Clone or download this branch. In Chrome, open `chrome://extensions`,
   enable **Developer mode**, select **Load unpacked**, and choose this
   repository's `extension/` folder. If upgrading an existing installation,
   reload it from the same folder or load this copy and disable the old one.
2. Sign in to your team's normal JobSwipe site. Open the extension, expand
   **Connect a hosted JobSwipe app**, save the exact HTTPS address, and reopen
   the extension on the JobSwipe tab. The extension asks Chrome for access
   only to the tab where you invoke it. It has no permanent site access.
3. In JobSwipe, confirm your profile and upload a résumé if you want to attach
   it later. In the extension, check **Include saved résumé** if desired.
   Add optional links, current work details, or voluntary self-ID answers
   in the extension, then click **Import JobSwipe profile**.

For a local JobSwipe install, use Node 24, run `npm ci`, and set
`MONGODB_URI` in `.env` to a development MongoDB database. Then start
`npm run server` and `npm run dev` in separate terminals. Open
<http://127.0.0.1:5173/>. The extension recognizes the regular localhost
app automatically. Reading a saved profile or résumé does not require an
Adzuna or Gemini key. If the optional ONNX installer fails, use
`ONNXRUNTIME_NODE_INSTALL=skip npm ci` on macOS/Linux or
`$env:ONNXRUNTIME_NODE_INSTALL = "skip"` before `npm ci` in PowerShell.

## Fill a Greenhouse application

1. Open a standard hosted application, such as a
   `https://job-boards.greenhouse.io/<board>/jobs/<id>` URL. In JobSwipe,
   Discover shows **Listings from Greenhouse** when that provider is active.
   Swipe right or click **Open application** to open the application in a new
   tab and mark it **Started**. **Save** keeps it for later. You can also open
   any supported Greenhouse listing independently.
2. Open the extension, review whether to include the imported résumé and
   voluntary answers on this form, then click **Fill with JobSwipe**.
   Some employer pages upload a résumé as soon as it is attached.
3. Review the employer page and the **Needs attention** list. The extension
   leaves existing entries unchanged and highlights blank required fields.
   You complete any remaining questions and submit yourself.

The extension stores only the configured site address persistently. Imported
profile details, the selected PDF/DOCX (up to 6 MiB), and optional self-ID
answers live in Chrome's session storage for up to 15 minutes of use. Use
**Clear imported data** to remove the temporary copy immediately. Optional
extension fields do not update your JobSwipe account. Self-ID answers are not
inferred or used for ranking. When the employer's options are ambiguous, the
extension leaves the question blank. Custom, embedded, or unsupported forms
may still require manual input.
