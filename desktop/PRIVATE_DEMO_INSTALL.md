# Dictator Desktop: private demo install

Dictator is a menu bar app: press a shortcut, speak, press it again, and the cleaned-up text is on your clipboard (or pasted for you). This is a private preview build, not a public release. Please don't pass the installer on.

## What you need

- macOS 12 Monterey or later.
- Two installers, pick the one for your Mac (Apple menu › About This Mac):
  - **Chip: Apple M1/M2/M3/M4…** → `Dictator-0.1.0-arm64.dmg`
  - **Processor: Intel** → `Dictator-0.1.0.dmg` (the Intel build)
- An internet connection. Speech is sent to the Dictator server for transcription; nothing runs offline.

## Install

1. Open the dmg and drag **Dictator** onto **Applications**. Eject the dmg.
2. Open Applications and double-click Dictator. Because this preview is not signed with an Apple Developer ID or notarized, macOS blocks the first launch:
   - **macOS 15 Sequoia and later:** macOS says it can't verify Dictator. Click **Done**, open **System Settings › Privacy & Security**, scroll down to the message about Dictator, click **Open Anyway**, and confirm with your password.
   - **macOS 12–14:** Control-click (or right-click) Dictator in Applications, choose **Open**, then **Open** again.
   - If macOS says **"Dictator is damaged and can't be opened"**, the file was quarantined by the download. Open Terminal and run:
     ```sh
     xattr -dr com.apple.quarantine /Applications/Dictator.app
     ```
     then open it again.
3. Dictator has no Dock icon. Look for a small **microphone icon in the menu bar**. If it isn't there (a full menu bar, a notch, or macOS 26 hiding new icons), turn Dictator on in **System Settings › Menu Bar › Allow in the Menu Bar**. The shortcut works even when the icon is hidden.

## Permissions

- **Microphone (required).** The first recording asks for microphone access; click **Allow**. If you denied it, turn on Dictator in **System Settings › Privacy & Security › Microphone** and try again (the menu bar menu offers **Open Microphone Settings…**).
- **Accessibility (only for Auto-Paste).** Not needed for Copy Only. See Auto-Paste below.

## Dictate

1. Click into wherever you want the text.
2. Press **⌃⌥Space** (Control+Option+Space). A small pill at the top of the screen shows the timer and level.
3. Speak (up to 2 minutes). English, Mandarin, Hindi and mixtures work.
4. Press **⌃⌥Space** again. After a second or two the pill says **Copied to clipboard**. Press **⌘V** to paste.

The first recording after a quiet period can take up to a minute while the server wakes up (the pill says so).

Pill colours: green means done; amber means the raw transcript was copied because the clean-up step failed; red means nothing was copied and your clipboard is untouched.

## Settings

Menu bar icon › **Settings…** (or ⌘, while the menu is open).

- **Recording shortcut:** click **Record Shortcut**, press the combination you want (for example ⌘⇧D), then **Save Shortcut**. Esc cancels; **Reset to Default** goes back to ⌃⌥Space. Letters, numbers and Space need ⌘, ⌃ or ⌥; function keys work alone. If a new shortcut does nothing, another app probably owns it; pick another.
- **Refinement:** how much the text is cleaned up.
  - **None:** no changes, the transcript as spoken.
  - **Light** (default): cleans up filler words and grammar.
  - **Medium:** also improves clarity and conciseness.
- **Output Behavior:** Copy Only (default) or Auto-Paste.

Settings are remembered after you quit and reopen Dictator. The same Refinement and Output choices are in the menu bar menu.

## Copy Only and Auto-Paste

- **Copy Only** (default): the text goes on the clipboard; you press ⌘V. Dictator never types anything.
- **Auto-Paste (experimental):** after copying, Dictator presses ⌘V once for you in the app you were in.
  1. Choose **Auto-Paste** in Settings › Output Behavior.
  2. Click **Open Accessibility Settings…**, turn on **Dictator** in System Settings › Privacy & Security › Accessibility. Settings then shows **Accessibility access: On**.
  3. Click into a text field (TextEdit, Notes, Chrome), dictate as usual.

  It only pastes if the same app is still in front and a text field has the cursor, and never into password fields. Otherwise the pill says **Copied to clipboard. Not pasted:** with the reason, and the text is on the clipboard for you to paste. Some apps (terminals, Google Docs, games) don't report their text field, so Dictator only copies there. If you click into a different field of the same app while it transcribes, the text goes there.

  If Auto-Paste stops working after installing a newer build, remove Dictator from the Accessibility list with **−** and allow it again; macOS ties the permission to each build of this unsigned preview.

## Privacy

Audio is sent to the Dictator server and on to OpenAI for transcription and clean-up. Dictator keeps no recordings or transcripts on the Mac; only your three settings are stored, in `~/Library/Application Support/Dictator/settings.json`. Usage is limited per network address (30 recordings a day) and in total per day, so you may see a "usage limit" message.

## Uninstall

1. Menu bar icon › **Quit Dictator**.
2. Drag **Dictator** from Applications to the Trash.
3. Optional clean-up, in Terminal:
   ```sh
   rm -rf ~/Library/Application\ Support/Dictator
   tccutil reset Microphone com.ezzy818.dictator
   tccutil reset Accessibility com.ezzy818.dictator
   ```
   (or remove Dictator from the Microphone and Accessibility lists in System Settings › Privacy & Security).
