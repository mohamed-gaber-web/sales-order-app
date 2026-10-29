import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ScannerModalComponent } from './scanner-modal.component';
import { ScanButtonComponent } from './scan-button.component';
import { TranslatePipe } from '@ngx-translate/core';

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, TranslatePipe],
  declarations: [ScannerModalComponent, ScanButtonComponent],
  exports: [ScannerModalComponent, ScanButtonComponent],
})
export class ScannerModalModule {}
