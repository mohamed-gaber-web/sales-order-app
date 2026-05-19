import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'ds-empty-state',
  templateUrl: './ds-empty-state.component.html',
  styleUrls: ['./ds-empty-state.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class DsEmptyStateComponent {
  @Input() icon = 'document-outline';
  @Input() title = 'Nothing here';
  @Input() message = '';
  @Input() buttonLabel = '';
  @Output() buttonClick = new EventEmitter<void>();
}
