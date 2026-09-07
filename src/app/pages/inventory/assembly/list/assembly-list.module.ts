import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { AssemblyListPage } from './assembly-list.page';
import { TranslatePipe } from '@ngx-translate/core';

const routes: Routes = [{ path: '', component: AssemblyListPage }];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes), TranslatePipe],
  declarations: [AssemblyListPage]
})
export class AssemblyListModule {}
