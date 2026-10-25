import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { DesignSystemModule } from '../../../../shared/design-system/design-system.module';
import { TransferLineDialogComponent } from './transfer-line-dialog.component';
import { OptionPickerComponent } from './option-picker.component';

// Shared by the Transfer Reservation / Pick / Registration screens and the line
// actions on a Transfer Order.
@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, DesignSystemModule],
  declarations: [TransferLineDialogComponent, OptionPickerComponent],
  exports: [TransferLineDialogComponent],
})
export class TransferLineDialogModule {}
