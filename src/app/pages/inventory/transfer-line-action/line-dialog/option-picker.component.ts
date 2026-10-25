import { Component, Input, OnInit, inject } from '@angular/core';
import { ModalController } from '@ionic/angular';

export interface PickerOption {
  value: string;
  label: string;
  /** Shown under the label, e.g. the warehouse a location belongs to. */
  detail?: string;
}

// Rendering thousands of rows stalls a handheld; past this, the search narrows it.
const MAX_SHOWN = 100;

/**
 * A searchable single-choice list in a sheet. Dismisses with role 'select' and
 * the chosen value ('' for the "not set" row), or role 'cancel'.
 */
@Component({
  selector: 'app-option-picker',
  templateUrl: './option-picker.component.html',
  styleUrls: ['./option-picker.component.scss'],
  standalone: false,
})
export class OptionPickerComponent implements OnInit {
  private modalCtrl = inject(ModalController);

  @Input() title = '';
  @Input() options: PickerOption[] = [];
  @Input() selected = '';
  @Input() noneLabel = '';

  filtered: PickerOption[] = [];
  shown: PickerOption[] = [];
  term = '';

  ngOnInit() {
    this.search('');
  }

  search(term: string) {
    this.term = term;
    const t = term.toLowerCase();
    this.filtered = t
      ? this.options.filter(o => o.label.toLowerCase().includes(t) || !!o.detail?.toLowerCase().includes(t))
      : this.options;
    this.shown = this.filtered.slice(0, MAX_SHOWN);
  }

  choose(value: string) {
    this.modalCtrl.dismiss(value, 'select');
  }

  dismiss() {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}
