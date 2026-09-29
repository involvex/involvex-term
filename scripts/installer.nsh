; involvex-term NSIS custom macros — Explorer "Open in involvex-term".
; Classic per-user (HKCU) verbs: no elevation needed. On Windows 11 the entry
; appears under "Show more options" (modern top-level needs MSIX, follow-up).
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
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\shell\InvolvexTerm"
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\InvolvexTerm"
  DeleteRegKey HKCU "Software\Classes\Drive\shell\InvolvexTerm"
!macroend
