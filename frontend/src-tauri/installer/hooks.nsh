; installer/hooks.nsh — TB-local NSIS installer hooks (checked-in override)
;
; ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
; The upstream @chamber-19/desktop-toolkit@2.2.4 hooks.nsh contains:
;
;   !macro NSIS_HOOK_POSTINSTALL
;     File "${BUILD_DIR}\desktop-toolkit-updater.exe"
;   !macroend
;
; NSIS's `File` directive embeds file data at compile time.  When the macro
; is DEFINED at the top-level of installer.nsi (Tauri's `!include` happens
; before any Section/Function), makensis refuses it with:
;   "command File not valid outside Section or Function"
;
; Fix: bundle the shim as a Tauri resource (tauri.conf.json -> bundle.resources)
; so Tauri's own Section-level `File` emits it, then promote it from the
; Tauri resources sub-directory into $INSTDIR in POSTINSTALL using `CopyFiles`
; (which IS valid in both Section and Function contexts).
;
; The prebuild sync script (scripts/sync-installer-assets-local.mjs) syncs the
; BMP/SVG installer art from the framework package but intentionally skips this
; file so our local override is never overwritten.
;
; See RELEASING.md §"Why we override hooks.nsh locally" for full rationale.
; ─────────────────────────────────────────────────────────────────────────

; ── Title-bar captions ────────────────────────────────────────────────────
; Tauri includes this file before it emits `!define PRODUCTNAME`, so immediate
; NSIS commands cannot safely use `${PRODUCTNAME}` here. Use the runtime
; `$(^Name)` token instead; it resolves after the later `Name "${PRODUCTNAME}"`
; statement in installer.nsi has run.
Caption          "$(^Name) — Setup"
UninstallCaption "$(^Name) — Uninstaller"

; ── Installer: INSTFILES page headers ─────────────────────────────────────
!define MUI_TEXT_INSTALLING_TITLE                "Installing ${PRODUCTNAME}"
!define MUI_TEXT_INSTALLING_SUBTITLE             "One moment while we set things up…"

!define MUI_INSTFILESPAGE_FINISHHEADER_TEXT      "Installation complete"
!define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT   "${PRODUCTNAME} is ready to launch."

!define MUI_INSTFILESPAGE_ABORTHEADER_TEXT       "Installation interrupted"
!define MUI_INSTFILESPAGE_ABORTHEADER_SUBTEXT    "Setup did not finish. You can safely re-run the installer."

; ── Uninstaller: INSTFILES page headers ───────────────────────────────────
!define MUI_UNTEXT_UNINSTALLING_TITLE            "Removing ${PRODUCTNAME}"
!define MUI_UNTEXT_UNINSTALLING_SUBTITLE         "Cleaning up app files and shortcuts…"

!define MUI_UNINSTFILESPAGE_FINISHHEADER_TEXT    "Uninstall complete"
!define MUI_UNINSTFILESPAGE_FINISHHEADER_SUBTEXT "${PRODUCTNAME} has been removed. Thanks for using it."

!define MUI_UNINSTFILESPAGE_ABORTHEADER_TEXT     "Uninstall interrupted"
!define MUI_UNINSTFILESPAGE_ABORTHEADER_SUBTEXT  "Removal did not finish. You can re-run the uninstaller from Apps & Features."

; ── Welcome / Finish wizard pages (when shown) ────────────────────────────
!define MUI_TEXT_WELCOME_INFO_TITLE              "Welcome to the ${PRODUCTNAME} Setup"
!define MUI_TEXT_WELCOME_INFO_TEXT               "This will install ${PRODUCTNAME} on your computer.$\r$\n$\r$\nClick Next to continue."

!define MUI_TEXT_FINISH_TITLE                    "All set"
!define MUI_TEXT_FINISH_SUBTITLE                 "${PRODUCTNAME} is installed and ready."
!define MUI_TEXT_FINISH_INFO_TITLE               "Setup complete"
!define MUI_TEXT_FINISH_INFO_TEXT                "${PRODUCTNAME} has been installed on your computer.$\r$\n$\r$\nClick Finish to close Setup."

!define MUI_UNTEXT_WELCOME_INFO_TITLE            "Welcome to the ${PRODUCTNAME} Uninstaller"
!define MUI_UNTEXT_WELCOME_INFO_TEXT             "This will remove ${PRODUCTNAME} from your computer.$\r$\n$\r$\nClick Next to continue."

!define MUI_UNTEXT_FINISH_TITLE                  "Uninstall complete"
!define MUI_UNTEXT_FINISH_SUBTITLE               "Thanks for using ${PRODUCTNAME}."
!define MUI_UNTEXT_FINISH_INFO_TITLE             "Uninstall complete"
!define MUI_UNTEXT_FINISH_INFO_TEXT              "${PRODUCTNAME} has been removed from your computer.$\r$\n$\r$\nClick Finish to close the uninstaller."

; ── Confirm-uninstall page ────────────────────────────────────────────────
!define MUI_UNTEXT_CONFIRM_TITLE                 "Remove ${PRODUCTNAME}"
!define MUI_UNTEXT_CONFIRM_SUBTITLE              "Confirm that you want to uninstall."

; ── Shared taskkill helper ────────────────────────────────────────────────
; Terminates the main app exe and the desktop-toolkit updater shim so NSIS
; can overwrite or delete the binaries without hitting "file in use" errors.
;
; The updater shim will have already exited by the time NSIS runs it during
; a force-update flow (it spawned the installer and is waiting on it), but
; we kill it here defensively in case of a partial install scenario.
;
; NOTE: sidecar processes (PyInstaller backends, etc.) are killed
; automatically by the OS when the parent Tauri process exits, because
; Tauri's `Command::new_sidecar` spawns them as child processes. If your
; app spawns sidecars via a mechanism that survives the parent, override
; this file in your tool's repo and add the appropriate taskkill lines.
!macro _KillAppProcesses
  nsExec::Exec 'taskkill /F /IM "${MAINBINARYNAME}.exe" /T'
  nsExec::Exec 'taskkill /F /IM "desktop-toolkit-updater.exe" /T'
  Sleep 2000
!macroend

; ── Pre-install hook: terminate running processes ─────────────────────────
!macro NSIS_HOOK_PREINSTALL
  !insertmacro _KillAppProcesses
!macroend

; ── Post-install hook: promote updater shim from resources/ to $INSTDIR ───
; The shim is bundled as a Tauri resource (see tauri.conf.json -> bundle.resources).
; Tauri installs it to $INSTDIR\resources\desktop-toolkit-updater.exe.
; We move it one level up so desktop-toolkit's Rust updater can find it at
;   current_exe().parent() / "desktop-toolkit-updater.exe"
; i.e. directly in $INSTDIR.  CopyFiles is used because it is valid in both
; Section and Function contexts, unlike the `File` directive which requires
; Section context and embeds data at NSIS compile time.
!macro NSIS_HOOK_POSTINSTALL
  ; Promote the updater shim from resources/ to $INSTDIR so desktop-toolkit's
  ; Rust updater can find it at current_exe().parent() / "desktop-toolkit-updater.exe".
  ; Guard with IfFileExists so a misconfigured build fails gracefully rather than silently.
  IfFileExists "$INSTDIR\resources\desktop-toolkit-updater.exe" +1 +2
  CopyFiles /SILENT "$INSTDIR\resources\desktop-toolkit-updater.exe" "$INSTDIR\desktop-toolkit-updater.exe"
!macroend

; ── Pre-uninstall hook: terminate running processes ───────────────────────
!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro _KillAppProcesses
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
!macroend
