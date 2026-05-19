import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'ds-stat',
  templateUrl: './ds-stat.component.html',
  styleUrls: ['./ds-stat.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class DsStatComponent {
  @Input() label = '';
  @Input() value: string | number = '';
  @Input() unit = '';
  @Input() accentColor = '';
  @Input() highlighted = false;
}
