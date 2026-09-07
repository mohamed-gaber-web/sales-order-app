import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { LocationMgmtRoutingModule } from './location-mgmt-routing.module';
import { LocationMgmtPage } from './location-mgmt.page';
import { TranslatePipe } from '@ngx-translate/core';

@NgModule({
  imports: [CommonModule, ReactiveFormsModule, IonicModule, LocationMgmtRoutingModule, TranslatePipe],
  declarations: [LocationMgmtPage]
})
export class LocationMgmtModule {}
