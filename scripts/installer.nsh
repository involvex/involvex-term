; involvex-term NSIS custom macros — Explorer "Open in involvex-term".
; Classic per-user (HKCU) verbs: no elevation needed. Sparse MSIX for Win11
; top-level is best-effort (unsigned packages need Developer Mode).
; electron-builder includes this file via nsis.include.
!macro customInstall
  WriteRegStr HKCU "Software\Classes\Directory\shell\InvolvexTerm" "" "Open in involvex-term"
  WriteRegStr HKCU "Software\Classes\Directory\shell\InvolvexTerm" "Icon" "$INSTDIR\involvex-term.exe,0"
  WriteRegStr HKCU "Software\Classes\Directory\shell\InvolvexTerm\command" "" '"$INSTDIR\involvex-term.exe" nt -d "%V"'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\InvolvexTerm" "" "Open in involvex-term"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\InvolvexTerm" "Icon" "$INSTDIR\involvex-term.exe,0"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\InvolvexTerm\command" "" '"$INSTDIR\involvex-term.exe" nt -d "%V"'
  WriteRegStr HKCU "Software\Classes\Drive\shell\InvolvexTerm" "" "Open in involvex-term"
  WriteRegStr HKCU "Software\Classes\Drive\shell\InvolvexTerm" "Icon" "$INSTDIR\involvex-term.exe,0"
  WriteRegStr HKCU "Software\Classes\Drive\shell\InvolvexTerm\command" "" '"$INSTDIR\involvex-term.exe" nt -d "%V"'
  ; Best-effort sparse package for Win11 top-level menu (ignore failures).
  IfFileExists "$INSTDIR\InvolvexTermExplorerCommand.msix" 0 skip_sparse
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "try { $$p = Get-AppxPackage -Name ''dev.involvex.term.explorer''; if ($$p) { Remove-AppxPackage -Package $$p.PackageFullName -ErrorAction SilentlyContinue }; Add-AppxPackage -Path ''$INSTDIR\InvolvexTermExplorerCommand.msix'' -ExternalLocation ''$INSTDIR'' -ErrorAction SilentlyContinue } catch { }"'
  skip_sparse:
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\InvolvexTerm"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\InvolvexTerm"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\InvolvexTerm"
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "try { $$p = Get-AppxPackage -Name ''dev.involvex.term.explorer''; if ($$p) { Remove-AppxPackage -Package $$p.PackageFullName -ErrorAction SilentlyContinue } } catch { }"'
!macroend
