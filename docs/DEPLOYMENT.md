# Deploying to company computers

This guide is for IT admins rolling the PII Review Assistant out to reviewers' Chrome (or Edge).
Reviewers do not install anything themselves: the browser installs and updates the extension.

## 1. Build the package

```bash
npm test          # all unit tests
npm run build     # release checks + dist/pii-review-assistant-<version>.zip
```

The zip holds only the extension files (no tests, docs or test page), with a `.sha256` checksum next to it.

**With the on-device model (optional):** `npm run setup-model` once (downloads ONNX Runtime Web and the
349 MB model, both pinned by SHA-256), then `npm run build:model`. The zip is about 260 MB; it includes the model,
which then runs entirely inside the browser. Switch it on for everyone with the `model` policy (`"on"`), leave it to
each reviewer (`"user"`, the default: off until they turn it on in the extension options), or block it (`"off"`).
The Chrome Web Store may not accept a package this large; self-hosting (B) has no such limit.
Pushing a tag such as `v2.0.0` does the same in GitHub Actions and attaches the zip to a GitHub release.

## 2. Choose how to distribute it

Today the team installs the GitHub beta zip with **Load unpacked** (`npm run release`, see the
[guide](GUIDE.md#releases-one-command)). Unpacked extensions never update themselves: every reviewer unzips each
new version. For automatic updates, pick A or B below.

| | A. Chrome Web Store, private (recommended) | B. Self-hosted |
|---|---|---|
| Needs | Google Workspace / Chrome Enterprise | An internal HTTPS server |
| Updates | Automatic from the Web Store | Automatic from your server |
| Extension ID | Given by the Web Store | Fixed by your private key |
| Works on | Managed Chrome on Windows, macOS, Linux, ChromeOS | Windows (domain-joined or MDM-enrolled), macOS (MDM), Linux |

### A. Chrome Web Store, private to your organisation

1. In the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) (signed in with a company account),
   add a new item and upload `dist/pii-review-assistant-<version>.zip`.
2. Under **Distribution → Visibility**, choose **Private** and your Google Workspace domain. Only your
   organisation can see or install it. Fill in the privacy section using [SECURITY.md](../SECURITY.md).
3. After review, copy the extension ID from the dashboard.
4. Google Admin console → **Devices → Chrome → Apps & extensions → Users & browsers** → pick the reviewers'
   organisational unit → **+ → Add from Chrome Web Store** (or by ID) → set to **Force install**.
5. For each new version: raise `version` in `manifest.json` and `package.json`, run `npm run build`
   and upload the new zip. Browsers update themselves.

### B. Self-hosted on your intranet

1. Create a signing key **once** and keep it safe (it fixes the extension ID; losing it means a new ID):
   ```bash
   openssl genrsa -out pii-review-assistant.pem 2048
   node scripts/extension-id.js pii-review-assistant.pem   # prints EXTENSION_ID
   ```
   Never commit the `.pem` (it is in `.gitignore`); store it in your secrets vault.
2. Build with the address where Chrome will look for updates:
   ```bash
   node scripts/build.js --update-url=https://intranet.example/pii-review-assistant/updates.xml
   ```
3. Pack the built folder into a `.crx` with the key:
   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --pack-extension=dist/pii-review-assistant-2.0.0 \
     --pack-extension-key=pii-review-assistant.pem
   ```
   (On Windows: `chrome.exe --pack-extension=… --pack-extension-key=…`.)
4. Put the `.crx` and [deploy/updates.xml](../deploy/updates.xml) (with `EXTENSION_ID`, the `.crx` address and the
   version filled in) on the intranet server.
5. Force-install with policy, using `EXTENSION_ID;UPDATE_URL`, where `UPDATE_URL` is the `updates.xml` address:
   - **Windows (GPO / Intune):** [deploy/windows-policy.reg](../deploy/windows-policy.reg), or the Chrome ADMX template
     setting *Configure the list of force-installed apps and extensions*.
   - **macOS (Jamf / Intune / Kandji):** [deploy/macos-policy.mobileconfig](../deploy/macos-policy.mobileconfig).
   - **Linux:** copy [deploy/linux-policy.json](../deploy/linux-policy.json) to `/etc/opt/chrome/policies/managed/`.
   - **Microsoft Edge:** the same settings under `SOFTWARE\Policies\Microsoft\Edge` (Windows) or `com.microsoft.Edge` (macOS).
6. For each new version: raise the version, build, pack with the **same key**, and update `updates.xml`.

Chrome blocks off-store extensions on unmanaged Windows and macOS machines, so option B only works on
company-managed computers. That is intended.

## 3. Organisation settings (optional)

Admins can set these for everyone; reviewers cannot change them. Without them the extension uses its defaults.

| Setting | Type | Default | What it does |
|---|---|---|---|
| `enabled` | boolean | `true` | `false` switches the assistant off on every page (kill switch). |
| `defaultStage` | `"L1"` / `"L2"` | `"L2"` | Stage for reviewers who have not picked one. |
| `pageSetup` | object | none | CSS selectors for the two documents and labels, so nobody has to set up the page. A reviewer's own saved setup still wins. |
| `extraKnownNames` | list of text | `[]` | Public names added to `data/business-names.json` (not PII; redacting one is over-scrubbing). |
| `supportContact` | text | `""` | Shown in the panel footer, e.g. `#pii-review-help`. |

Where to put them:

- **Google Admin console:** the extension's **Policy for extensions** box, in the format of
  [deploy/admin-console.json](../deploy/admin-console.json) (each value wrapped in `{"Value": …}`).
- **Windows / macOS / Linux:** already included in the files in `deploy/` (the `3rdparty` section, the
  `com.google.Chrome.extensions.EXTENSION_ID` payload). [deploy/managed-config.example.json](../deploy/managed-config.example.json)
  shows every setting.

To get `pageSetup` values: on one computer, open a task, use **Page setup → Set up manually** (or
**Looks right — save**). Then open DevTools, pick **PII Review Assistant** in the console's context menu
(top left, where it says *top*), run `chrome.storage.local.get(null, console.log)` and copy the `piira.setup.<site>` entry's
`leftDocument`, `rightDocument` and `label`.

**Check it took effect:** open `chrome://policy` on a reviewer's machine. The settings are listed under
the extension's ID; the panel's **Page setup** says *Set by your organisation* when `pageSetup` is used.

## 4. Updating the business names list

Edit `data/business-names.json`, raise the version and release as above. For a quick company-wide
addition without a release, use the `extraKnownNames` setting.

## 5. Rollout checklist

- [ ] `npm test` and `npm run check` pass
- [ ] Version raised in `manifest.json` and `package.json`, entry added to `CHANGELOG.md`
- [ ] Pilot group (one organisational unit) for a week before everyone
- [ ] `chrome://policy` and `chrome://extensions` checked on one Windows and one Mac machine
- [ ] Security / privacy review has [SECURITY.md](../SECURITY.md)
- [ ] For self-hosting: the `.pem` key is in the secrets vault
