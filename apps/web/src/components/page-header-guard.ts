/** 09 § 5.2 guard rail (test-only): primary (`data-variant="default"` or `"ink"`) buttons/links inside page headers; more than one is a design error. */
export function countPrimaryActions(root: HTMLElement): number {
  return root.querySelectorAll(
    ['default', 'ink'].flatMap((v) => [`[data-slot="page-header"] button[data-variant="${v}"]`, `[data-slot="page-header"] a[data-variant="${v}"]`]).join(', '),
  ).length;
}
