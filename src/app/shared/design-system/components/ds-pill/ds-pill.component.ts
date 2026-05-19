import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

export type DsPillVariant = 'status' | 'tag' | 'count';

@Component({
  selector: 'ds-pill',
  templateUrl: './ds-pill.component.html',
  styleUrls: ['./ds-pill.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class DsPillComponent {
  @Input() label = '';
  @Input() color = '';
  @Input() bg = '';
  @Input() variant: DsPillVariant = 'status';
}
