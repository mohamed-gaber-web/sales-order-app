import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';

@Component({
  selector: 'app-license-plate-list',
  templateUrl: './license-plate-list.page.html',
  styleUrls: ['./license-plate-list.page.scss'],
  standalone: false,
})
export class LicensePlateListPage {
  lpId = '';

  constructor(
    private router: Router,
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
  ) {}

  goBack(): void {
    this.router.navigate(['/inventory']);
  }

  lookUp(): void {
    const id = this.lpId.trim();
    if (!id) return;
    this.router.navigate(['/inventory/license-plate/detail', id]);
  }

  async showBuildAlert(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Build License Plate',
      inputs: [
        { name: 'lpId', type: 'text', placeholder: 'License Plate ID' },
        { name: 'warehouseId', type: 'text', placeholder: 'Warehouse ID' },
        { name: 'locationId', type: 'text', placeholder: 'Location ID' },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Build',
          handler: async () => {
            await this.showActionToast('License plate built (stub)');
          },
        },
      ],
    });
    await alert.present();
  }

  async showSplitAlert(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Split License Plate',
      inputs: [
        { name: 'sourceLpId', type: 'text', placeholder: 'Source LP ID' },
        { name: 'newLpId', type: 'text', placeholder: 'New LP ID' },
        { name: 'quantity', type: 'number', placeholder: 'Quantity to split' },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Split',
          handler: async () => {
            await this.showActionToast('License plate split (stub)');
          },
        },
      ],
    });
    await alert.present();
  }

  async showMergeAlert(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Merge License Plates',
      inputs: [
        { name: 'sourceLpId', type: 'text', placeholder: 'Source LP ID' },
        { name: 'targetLpId', type: 'text', placeholder: 'Target LP ID' },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Merge',
          handler: async () => {
            await this.showActionToast('License plates merged (stub)');
          },
        },
      ],
    });
    await alert.present();
  }

  async showMoveAlert(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Move License Plate',
      inputs: [
        { name: 'lpId', type: 'text', placeholder: 'License Plate ID' },
        { name: 'toWarehouse', type: 'text', placeholder: 'To Warehouse ID' },
        { name: 'toLocation', type: 'text', placeholder: 'To Location ID' },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Move',
          handler: async () => {
            await this.showActionToast('License plate moved (stub)');
          },
        },
      ],
    });
    await alert.present();
  }

  private async showActionToast(message: string): Promise<void> {
    const loading = await this.loadingCtrl.create({ message: 'Processing...', duration: 800 });
    await loading.present();
    await loading.onDidDismiss();
    const toast = await this.toastCtrl.create({
      message,
      buttons: [{ text: 'Dismiss', role: 'cancel' }],
      color: 'success',
      position: 'bottom',
      icon: 'checkmark-circle-outline',
    });
    await toast.present();
  }
}
