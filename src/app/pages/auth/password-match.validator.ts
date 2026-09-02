import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Cross-field validator: the two password boxes must agree.
 *
 * Applied to the group rather than the confirmation control, because a control
 * validator only re-runs when its own value changes — so editing the *first*
 * box after the two matched would leave a stale "passwords match" verdict.
 *
 * Shared by the two screens where a password is set: redeeming an invitation
 * and redeeming a reset link.
 */
export function passwordsMatch(passwordKey: string, confirmKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get(passwordKey)?.value;
    const confirm = group.get(confirmKey)?.value;

    // Nothing to compare yet — `required` on each control covers the empty case.
    if (!password || !confirm) return null;

    return password === confirm ? null : { passwordMismatch: true };
  };
}
