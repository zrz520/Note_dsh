# Platform support

| Platform | Host filesystem | Folder picker | Status |
|---|---|---|---|
| macOS Desktop | Node `fs` | native NSOpenPanel | Tested (DSH 0.2.2-rc.1) |
| Windows Desktop | Node `fs` | native IFileOpenDialog | Code path ready; not runtime-tested |
| Linux Desktop | Node `fs` | Zenity/KDialog | Requires one of them; not runtime-tested |
| Remote Web | Host disk, not the browser device | browse | **Not supported by design** |

## Why remote is not supported

The library is a directory on the **DSH Host** machine. When DSH runs remotely,
the browser cannot open the host's native folder dialog. This plugin deliberately
supports only the native picker; in `browse` mode it keeps an already-configured
library usable but disables changing the root and shows a "desktop local mode"
notice.

## Name portability

Create/rename/import reject Windows-reserved characters (`<>:"|?*`), trailing
dots, and device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`,
`LPT1`–`LPT9`) on every platform, so a library remains usable when moved between
macOS, Windows, and Linux.

## Manual checks still needed

- Windows: drive-letter and UNC roots, case-only rename, native picker.
- Linux: native picker with Zenity and with KDialog; behavior when neither is
  installed should be the desktop-local warning, not a broken screen.
