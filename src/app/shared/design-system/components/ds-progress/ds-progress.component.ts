import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

@Component({
  selector: 'ds-progress',
  templateUrl: './ds-progress.component.html',
  styleUrls: ['./ds-progress.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class DsProgressComponent {
  @Input() value = 0; // 0 to 1
  @Input() color = '';
  @Input() labelLeft = '';
  @Input() labelRight = '';
}
