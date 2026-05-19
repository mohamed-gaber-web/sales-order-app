import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'ds-search',
  templateUrl: './ds-search.component.html',
  styleUrls: ['./ds-search.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class DsSearchComponent implements OnInit, OnDestroy {
  @Input() placeholder = 'Search...';
  @Input() debounceMs = 300;
  @Input() light = false;
  @Output() query = new EventEmitter<string>();

  value = '';
  focused = false;

  private input$ = new Subject<string>();

  ngOnInit() {
    this.input$
      .pipe(debounceTime(this.debounceMs), distinctUntilChanged())
      .subscribe(v => this.query.emit(v));
  }

  ngOnDestroy() {
    this.input$.complete();
  }

  onInput() {
    this.input$.next(this.value.trim());
  }

  clear() {
    this.value = '';
    this.input$.next('');
  }
}
