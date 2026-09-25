// Ask the TerminalView owning `tabId` to focus its xterm instance.
// Used when closing overlays (search bar, palette) so typing goes back
// to the shell instead of a dead input.
export function focusTerm(tabId: string): void {
  window.dispatchEvent(
    new CustomEvent<string>("involvex:focus-term", { detail: tabId }),
  );
}
