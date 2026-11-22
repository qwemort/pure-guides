# Pure Spoiler Blocker: network check

**❌ 4 request(s) made by the extension**

Last run: 2026-11-22. Extension version: 1.4.1. Built from [qwemort/pure-spoiler-shield@f50601b](https://github.com/qwemort/pure-spoiler-shield/tree/f50601bd798ec2d73c04e7bfbddb6cf9a6321796). [Run log](https://github.com/qwemort/pure-guides/actions/runs/45030991007).

How it works (every week, automatically, code: [tools/privacy-proof.mjs](../tools/privacy-proof.mjs)):

1. The extension is built from its public source and loaded into a real Chromium browser.
2. **Self-test:** the extension's background script sends one test request on purpose. The check is valid only if the detector sees it. Result: seen ✅.
3. With a spoiler shield turned on, the browser opens: YouTube, YouTube (главная), Reddit, X, окно расширения, приветствие расширения.
4. Every request started by the extension is counted: from its background script, from its code running on those pages (detected by the call stack), and from its own windows.

Requests by the extension: **4**

- background: https://www.youtube.com/sw.js
- background: https://www.youtube.com/s/desktop/95c3254f/jsbin/serviceworker-notifications.vflset/serviceworker-notifications.js
- background: https://www.youtube.com/sw.js_data
- background: https://www.youtube.com/youtubei/v1/notification_registration/set_registration?prettyPrint=false

Pages themselves (YouTube, Reddit, X) of course make their own requests; those are not the extension's and are not counted.
