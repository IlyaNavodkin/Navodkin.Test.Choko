; Inno Setup script for the Casewright desktop app.
; Compiles the nw-builder output (../build/out) into a single per-user installer:
;   Casewright-Setup-<version>.exe  (no admin/UAC, Start Menu shortcut, uninstaller)
;
; The version is injected by CI:  ISCC.exe /DMyAppVersion=0.1.0 casewright.iss
; Paths are relative to this .iss file (apps/desktop/build-resources/).

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif

#define MyAppName "Casewright"
#define MyAppPublisher "Jim Buck"
#define MyAppURL "https://github.com/jimbuck/casewright"
#define MyAppExeName "Casewright.exe"

[Setup]
; A stable, app-unique GUID — keep this constant across releases so upgrades replace cleanly.
AppId={{8F4C2A7E-1B3D-4E6F-9A2C-5D7E8F0A1B2C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}/releases
VersionInfoVersion={#MyAppVersion}

; Per-user install — no admin prompt. {autopf} resolves to %LocalAppData%\Programs here.
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}

; x64 app.
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

; Branding + output.
SetupIconFile=icon.ico
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
OutputDir=..\build
OutputBaseFilename=Casewright-Setup-{#MyAppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; The entire nw-builder output (Casewright.exe + Chromium runtime + merged app).
Source: "..\build\out\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; Interactive install: offer the usual "launch now" checkbox.
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
; Silent (auto-update) install: relaunch automatically so "Relaunch to Update" works.
; WizardSilent is true only under /SILENT or /VERYSILENT, so interactive installs don't double-launch.
Filename: "{app}\{#MyAppExeName}"; Flags: nowait runasoriginaluser; Check: WizardSilent
