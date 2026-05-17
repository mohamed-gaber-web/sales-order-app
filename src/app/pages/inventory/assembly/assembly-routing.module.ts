import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./list/assembly-list.module').then(m => m.AssemblyListModule)
  },
  {
    path: 'assemble/:orderNumber',
    loadChildren: () => import('./assemble/assembly-form.module').then(m => m.AssemblyFormModule)
  },
  {
    path: 'disassemble/:orderNumber',
    loadChildren: () => import('./disassemble/disassembly-form.module').then(m => m.DisassemblyFormModule)
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AssemblyRoutingModule {}
