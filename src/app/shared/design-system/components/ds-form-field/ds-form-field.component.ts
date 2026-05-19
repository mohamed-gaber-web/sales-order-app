import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'ds-form-field',
  templateUrl: './ds-form-field.component.html',
  styleUrls: ['./ds-form-field.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class DsFormFieldComponent {
  @Input() label = '';
  @Input() required = false;
  @Input() optional = false;
  @Input() hint = '';
  @Input() errorMessage = '';
  @Input() showError = false;
}
