import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'ds-cta-bar',
  templateUrl: './ds-cta-bar.component.html',
  styleUrls: ['./ds-cta-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class DsCtaBarComponent {
  @Input() label = 'Submit';
  @Input() icon = 'checkmark-circle-outline';
  @Input() loading = false;
  @Input() disabled = false;
  @Input() secondaryLabel = '';
  @Input() secondaryIcon = '';
  @Output() ctaClick = new EventEmitter<void>();
  @Output() secondaryClick = new EventEmitter<void>();
}
