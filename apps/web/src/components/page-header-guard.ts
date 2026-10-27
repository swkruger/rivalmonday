/** 09 § 5.2 guard rail (test-only): primary (`data-variant="default"`) buttons/links inside page headers; more than one is a design error. */
export function countPrimaryActions(root: HTMLElement): number {
  return root.querySelectorAll('[data-slot="page-header"] button[data-variant="default"], [data-slot="page-header"] a[data-variant="default"]').length;
}
