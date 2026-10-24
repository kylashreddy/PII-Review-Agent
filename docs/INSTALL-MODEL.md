# Installing the PII Review Assistant with the model (beta)

For reviewers on Windows or Mac. No Node, Git or terminal needed.

1. Download **`pii-review-assistant-2.0.0-model.zip`** from the latest **ml-beta** release on GitHub
   (Releases → ml-beta-…). It is about 260 MB.
2. Unzip it: Windows — right-click → **Extract All…**; Mac — double-click. Keep the folder somewhere permanent
   (for example `Documents\pii-review-assistant`), not in Downloads: Chrome loads it from there every time.
3. Open `chrome://extensions`, switch on **Developer mode** (top right).
4. **Remove** any older PII Review Assistant, then **Load unpacked** and pick the unzipped folder
   (the one that contains `manifest.json`).
5. Click **Details → Extension options**, tick **Use model suggestions**, click **Test the model**.
   It should say **Ready** and list names, companies and addresses for the sample.
6. Reload the Peak Talent task. The panel shows *Model: done — …* and tags such as `Person Name · model`.

If the options page says **Not installed in this build**, Chrome is loading a folder without the model
(for example a GitHub "Download ZIP" of the code). Load the folder from step 2 instead.

Updating: download the new release zip, unzip it over the same folder, then click **reload ↻** on the
extension in `chrome://extensions`. Your options stay as they were.

Developers working from a clone instead: `npm run setup-model` (Windows and Mac), then load the clone folder.
