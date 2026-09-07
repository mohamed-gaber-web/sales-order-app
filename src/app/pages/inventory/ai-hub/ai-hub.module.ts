import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { AiHubPage } from './ai-hub.page';
import { TranslatePipe } from '@ngx-translate/core';

const routes: Routes = [
  { path: '', component: AiHubPage },
];

@NgModule({
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes), TranslatePipe],
  declarations: [AiHubPage],
})
export class AiHubModule {}
