import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { TranslatePipe } from '@ngx-translate/core';
import { TransferPickDialogComponent } from './transfer-pick-dialog.component';

// Shared by the Transfer Pick screen and the Pick button on Transfer Order lines.
@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, TranslatePipe],
  declarations: [TransferPickDialogComponent],
  exports: [TransferPickDialogComponent],
})
export class TransferPickDialogModule {}
