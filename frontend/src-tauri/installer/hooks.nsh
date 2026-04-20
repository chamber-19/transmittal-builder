; ---------------------------------------------------------------------------
; SYNCED FROM desktop-toolkit v2.0.0 — DO NOT EDIT HERE.
; Source of truth: https://github.com/chamber-19/desktop-toolkit (installer/hooks.nsh)
; Keep this local copy until tauri.conf.json can reference the file inside
; node_modules/@chamber-19/desktop-toolkit/installer/ (tracked for Phase 3).
; ---------------------------------------------------------------------------
; Transmittal Builder — NSIS installer hooks
;
; Wired in via tauri.conf.json -> bundle.windows.nsis.installerHooks.
; Tauri's default installer template `!include`s this file VERY early
; (before any MUI page macros and before `Name` / `BrandingText`), so
; `!define`s here override the MUI defaults for both the installer and
; the uninstaller, and `Caption` / `UninstallCaption` set the title-bar
; text without having to fork the entire installer template.
;
; Scope of customisation (kept intentionally minimal — anything more
; involved would mean forking Tauri's installer.nsi.tera, which we do
; not want to maintain across Tauri upgrades):
;   * Title-bar captions read in our brand voice
;   * INSTFILES "Complete" / "Aborted" header strings on both installer
;     and uninstaller (this is the page in the screenshot with the
;     green progress bar)
;   * "Installing…" / "Uninstalling…" page titles
;   * Welcome / Finish wizard page titles
;
; What we deliberately do NOT change here:
;   * The OS-drawn dialog frame / title-bar buttons (owned by Windows)
;   * The progress-bar colour (drawn by the OS theme; not skinnable
;     without a custom UI resource, which would mean a template fork)
;   * The "Show details" button itself (it's a built-in INSTFILES
;     control; hiding it requires a per-page show callback that we
;     would have to inject by forking the template)
; ---------------------------------------------------------------------------

; ── Title-bar captions ────────────────────────────────────────────────────
; Without these NSIS uses "<Name> Setup" and "<Name> Uninstall", which is
; what produces the "Transmittal Builder Uninstall" caption visible in
; the bug report screenshot.
Caption          "Transmittal Builder — Setup"
UninstallCaption "Transmittal Builder — Uninstaller"

; ── Installer: INSTFILES page headers ─────────────────────────────────────
!define MUI_TEXT_INSTALLING_TITLE                "Installing Transmittal Builder"
!define MUI_TEXT_INSTALLING_SUBTITLE             "One moment while we forge the install…"

!define MUI_INSTFILESPAGE_FINISHHEADER_TEXT      "Installation complete"
!define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT   "Transmittal Builder is ready to launch."

!define MUI_INSTFILESPAGE_ABORTHEADER_TEXT       "Installation interrupted"
!define MUI_INSTFILESPAGE_ABORTHEADER_SUBTEXT    "Setup did not finish. You can safely re-run the installer."

; ── Uninstaller: INSTFILES page headers (the page in the screenshot) ──────
!define MUI_UNTEXT_UNINSTALLING_TITLE            "Removing Transmittal Builder"
!define MUI_UNTEXT_UNINSTALLING_SUBTITLE         "Cleaning up app files and shortcuts…"

!define MUI_UNINSTFILESPAGE_FINISHHEADER_TEXT    "Uninstall complete"
!define MUI_UNINSTFILESPAGE_FINISHHEADER_SUBTEXT "Transmittal Builder has been removed. Thanks for using it."

!define MUI_UNINSTFILESPAGE_ABORTHEADER_TEXT     "Uninstall interrupted"
!define MUI_UNINSTFILESPAGE_ABORTHEADER_SUBTEXT  "Removal did not finish. You can re-run the uninstaller from Apps & Features."

; ── Welcome / Finish wizard pages (when shown) ────────────────────────────
!define MUI_TEXT_WELCOME_INFO_TITLE              "Welcome to the Transmittal Builder Setup"
!define MUI_TEXT_WELCOME_INFO_TEXT               "This will install Transmittal Builder on your computer.$\r$\n$\r$\nClick Next to continue."

!define MUI_TEXT_FINISH_TITLE                    "All set"
!define MUI_TEXT_FINISH_SUBTITLE                 "Transmittal Builder is installed and ready."
!define MUI_TEXT_FINISH_INFO_TITLE               "Setup complete"
!define MUI_TEXT_FINISH_INFO_TEXT                "Transmittal Builder has been installed on your computer.$\r$\n$\r$\nClick Finish to close Setup."

!define MUI_UNTEXT_WELCOME_INFO_TITLE            "Welcome to the Transmittal Builder Uninstaller"
!define MUI_UNTEXT_WELCOME_INFO_TEXT             "This will remove Transmittal Builder from your computer.$\r$\n$\r$\nClick Next to continue."

!define MUI_UNTEXT_FINISH_TITLE                  "Uninstall complete"
!define MUI_UNTEXT_FINISH_SUBTITLE               "Thanks for using Transmittal Builder."
!define MUI_UNTEXT_FINISH_INFO_TITLE             "Uninstall complete"
!define MUI_UNTEXT_FINISH_INFO_TEXT              "Transmittal Builder has been removed from your computer.$\r$\n$\r$\nClick Finish to close the uninstaller."

; ── Confirm-uninstall page ────────────────────────────────────────────────
!define MUI_UNTEXT_CONFIRM_TITLE                 "Remove Transmittal Builder"
!define MUI_UNTEXT_CONFIRM_SUBTITLE              "Confirm that you want to uninstall."

; Tauri's installer.nsi.tera looks for these optional macros and
; `!insertmacro`s them at the appropriate point if defined.
!macro NSIS_HOOK_PREINSTALL
  ; Kill any running app or sidecar instances before file-write phase.
  ; /F = force, /IM = by image name, /T = include child process tree.
  ; nsExec discards the exit code, so "no such process" is not an error.
  nsExec::Exec 'taskkill /F /IM transmittal-builder.exe /T'
  nsExec::Exec 'taskkill /F /IM transmittal-backend.exe /T'
  ; Give the OS a moment to release file handles before we overwrite files.
  Sleep 1000
!macroend
!macro NSIS_HOOK_POSTINSTALL
!macroend
!macro NSIS_HOOK_PREUNINSTALL
  ; Kill any running app or sidecar instances before the uninstaller removes files.
  nsExec::Exec 'taskkill /F /IM transmittal-builder.exe /T'
  nsExec::Exec 'taskkill /F /IM transmittal-backend.exe /T'
  Sleep 1000
!macroend
!macro NSIS_HOOK_POSTUNINSTALL
!macroend
