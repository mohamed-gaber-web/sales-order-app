import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'ds-toggle-row',
  templateUrl: './ds-toggle-row.component.html',
  styleUrls: ['./ds-toggle-row.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class DsToggleRowComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() icon = '';
  @Input() checked = false;
  @Input() color: 'primary' | 'secondary' = 'secondary';
  @Output() toggleChange = new EventEmitter<boolean>();

  onChange(event: CustomEvent) {
    this.toggleChange.emit((event.detail as { checked: boolean }).checked);
  }
}
