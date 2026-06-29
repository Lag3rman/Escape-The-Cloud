# Escape The Cloud

Escape The Cloud is a Windows desktop app built with Electron that helps users compare files in a local folder against files in Google Drive using file hashes. When matches are found, the app can ask for confirmation and then delete the matching cloud files from Google Drive.

The app is designed for users who want to clean up cloud copies of files that already exist locally.

## What It Does

- Lets the user pick a local folder
- Signs the user into Google Drive with OAuth 2.0
- Hashes local files with MD5
- Reads Google Drive file metadata and MD5 checksums
- Finds Google Drive files whose hash matches a local file
- Asks for confirmation before deleting the matching cloud files

## Current Scope

- Google Drive only
- Windows desktop installer supported
- Electron-based desktop UI
- User-supplied Google OAuth Desktop App credentials

## Important Notes

- The app only compares Google Drive files that expose an MD5 checksum.
- Google-native document types such as Docs, Sheets, and Slides do not behave like normal downloadable files and are not part of this duplicate cleanup flow.
- The app deletes files from Google Drive only after explicit user confirmation.
- `credentials.json` can stay in the user's Downloads folder or any other location they choose. The app stores the selected path and reuses it later.

## How It Works

1. The user clicks `Pick credentials.json` and selects a Google OAuth Desktop App credentials file.
2. The user clicks `Google Drive`.
3. The app asks the user to choose a local folder.
4. The app opens the Google sign-in flow in the browser.
5. After sign-in, the app compares local file hashes with Google Drive file checksums.
6. If matches are found, the app asks whether those cloud files should be deleted.
7. If the user confirms, the app deletes the matching Google Drive files.

## User Setup

### 1. Create Google OAuth Credentials

In Google Cloud Console:

1. Create a new project or select an existing one.
2. Enable the Google Drive API.
3. Open `APIs & Services` -> `Credentials`.
4. Create an `OAuth client ID`.
5. Choose application type `Desktop app`.
6. Download the JSON credentials file.

Google Cloud Console:

- <https://console.cloud.google.com/>

### 2. Use the App

1. Launch the installed app.
2. Click `Pick credentials.json`.
3. Select the downloaded Google OAuth credentials file.
4. Click `Google Drive`.
5. Select the local folder you want to compare against Google Drive.
6. Complete the Google sign-in flow in your browser.
7. Review the match count and confirm deletion if you want the cloud copies removed.

## Cleanup / Revoke Access

The app includes buttons to:

- Clear the cached Google token
- Delete an app-local `credentials.json` file if one exists

Users can also manually revoke access:

1. Open Google account permissions: <https://myaccount.google.com/permissions>
2. Remove the app from authorized access
3. Disable the Drive API in the Google Cloud project if no longer needed
4. Delete the OAuth client from Google Cloud Console if no longer needed

## Installer

The project uses `electron-builder` with NSIS to produce a Windows installer.

The installer currently:

- Installs a Windows desktop app
- Lets the user choose the install location
- Creates a desktop shortcut

Build output is generated in:

- `dist/`

Typical installer file:

- `dist/Escape from Google Drive Setup 1.0.0.exe`

## Development

### Requirements

- Node.js
- npm
- Windows PowerShell

### Install Dependencies

```powershell
cd E:\Cloud\cloud-file-manager
npm install
```

### Run in Development

```powershell
cd E:\Cloud\cloud-file-manager
npm start
```

### Build the Installer

```powershell
cd E:\Cloud\cloud-file-manager
npm run build:win
```

## Project Files

- `main.js` - Electron main process, OAuth flow, file hashing, Google Drive comparison, deletion logic, and setup persistence
- `index.html` - UI and renderer-side interactions
- `package.json` - scripts, dependencies, and electron-builder configuration

## Security Considerations

- Users should create and control their own Google OAuth Desktop App credentials.
- Do not distribute personal `credentials.json` files.
- Do not commit local credentials or tokens to source control.
- The repository ignores `credentials.json`, `userData/`, `dist/`, and `node_modules/`.

## Limitations

- Windows-focused packaging is configured; cross-platform installers are not currently set up.
- The app uses MD5 checksums exposed by Google Drive metadata, so unsupported file types are skipped.
- The app currently focuses on duplicate cloud cleanup, not backup, synchronization, or restore workflows.

## Repository

- GitHub: <https://github.com/Lag3rman/Escape-The-Cloud>
