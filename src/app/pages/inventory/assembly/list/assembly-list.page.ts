import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-assembly-list',
  templateUrl: './assembly-list.page.html',
  styleUrls: ['./assembly-list.page.scss'],
  standalone: false,
})
export class AssemblyListPage {
  activeSegment: 'assembly' | 'disassembly' = 'assembly';
  assemblyOrderNumber = '';
  disassemblyOrderNumber = '';

  constructor(
    private router: Router,
    private toastCtrl: ToastController,
  ) {}

  async lookUpAssembly() {
    const order = this.assemblyOrderNumber.trim();
    if (!order) {
      const t = await this.toastCtrl.create({
        message: 'Enter an assembly order number.',
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
        color: 'warning',
        position: 'bottom',
      });
      await t.present();
      return;
    }
    this.router.navigate(['/inventory/assembly/assemble', order]);
  }

  async lookUpDisassembly() {
    const order = this.disassemblyOrderNumber.trim();
    if (!order) {
      const t = await this.toastCtrl.create({
        message: 'Enter a parent item or license plate number.',
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
        color: 'warning',
        position: 'bottom',
      });
      await t.present();
      return;
    }
    this.router.navigate(['/inventory/assembly/disassemble', order]);
  }

  goBack() { this.router.navigate(['/inventory']); }
}
