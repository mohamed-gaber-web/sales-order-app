import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

export type DsButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type DsButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'ds-button',
  templateUrl: './ds-button.component.html',
  styleUrls: ['./ds-button.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class DsButtonComponent {
  @Input() variant: DsButtonVariant = 'primary';
  @Input() size: DsButtonSize = 'md';
  @Input() loading = false;
  @Input() disabled = false;
  @Input() icon = '';
  @Input() expand: 'block' | 'full' | 'inherit' = 'inherit';
  @Input() label = '';
  @Output() btnClick = new EventEmitter<void>();

  get ionExpand(): 'block' | 'full' | undefined {
    return this.expand === 'inherit' ? undefined : this.expand;
  }

  get ionFill(): 'solid' | 'outline' | 'clear' {
    switch (this.variant) {
      case 'ghost':   return 'clear';
      case 'outline': return 'outline';
      default:        return 'solid';
    }
  }

  get ionColor(): string {
    switch (this.variant) {
      case 'primary':   return 'secondary'; // orange accent = ion-color-secondary
      case 'secondary': return 'primary';   // navy = ion-color-primary
      case 'danger':    return 'danger';
      case 'ghost':     return 'primary';
      case 'outline':   return 'primary';
      default:          return 'secondary';
    }
  }

  onClick() {
    if (!this.disabled && !this.loading) this.btnClick.emit();
  }
}
