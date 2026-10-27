
## Herunterladen und installieren

| System | Datei | |
| --- | --- | --- |
| Windows 10/11 (64 Bit) | `VESPER-Setup-<version>.exe` | Installer (empfohlen) |
| Windows 10/11 (64 Bit) | `VESPER-<version>-portable.exe` | ohne Installation starten |
| Windows 10/11 (64 Bit) | `VESPER-<version>-win-x64.zip` | entpacken, `VESPER.exe` starten |
| macOS 11 oder neuer (Apple Silicon und Intel) | `VESPER-<version>-mac-universal.dmg` | öffnen, VESPER in „Programme“ ziehen |
| macOS | `VESPER-<version>-mac-universal.zip` | Alternative zur DMG |

Die Builds sind nicht mit einem kostenpflichtigen Entwicklerzertifikat signiert. Beim ersten Start warnt das System deshalb:

- **Windows (SmartScreen):** „Der Computer wurde durch Windows geschützt“ → **Weitere Informationen** → **Trotzdem ausführen**.
- **macOS (Gatekeeper):** Nach dem ersten Startversuch **Systemeinstellungen → Datenschutz & Sicherheit** öffnen und bei VESPER **Dennoch öffnen** wählen. Meldet macOS „ist beschädigt“, einmal im Terminal ausführen: `xattr -cr /Applications/VESPER.app`

Spielstände: Windows `%APPDATA%\VESPER\saves\`, macOS `~/Library/Application Support/VESPER/saves/`.
