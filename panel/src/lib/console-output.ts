/** Remove terminal control sequences before displaying plain-text logs. */
export function stripAnsi(text: string): string {
  return text.replace(
    // CSI (including SGR), OSC titles/links, and other ESC control strings.
    // eslint-disable-next-line no-control-regex -- Terminal escapes are the input being removed.
    /[\u001b\u009b][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
    "",
  );
}
