import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ActionSheetController, AlertController, ToastController } from '@ionic/angular';
import { SalesOrder, OrderStatus, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '../../../models/sales-order.model';

@Component({
  selector: 'app-sales-order-detail',
  templateUrl: './sales-order-detail.page.html',
  styleUrls: ['./sales-order-detail.page.scss'],
  standalone: false
})
export class SalesOrderDetailPage implements OnInit {
  orderId: string | null = null;
  order: SalesOrder | null = null;
  isLoading = true;

  statusLabels = ORDER_STATUS_LABELS;
  statusColors = ORDER_STATUS_COLORS;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private actionSheetCtrl: ActionSheetController,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {}

  ngOnInit() {
    this.orderId = this.route.snapshot.paramMap.get('id');
    if (this.orderId) {
      this.loadOrder(this.orderId);
    }
  }

  loadOrder(id: string) {
    this.isLoading = true;
    // Replace with API call
    setTimeout(() => {
      this.order = {
        id: id,
        orderNumber: 'SO-2024-001',
        customerName: 'John Smith',
        customerEmail: 'john.smith@example.com',
        customerPhone: '+1 234 567 8900',
        orderDate: new Date('2024-01-15'),
        deliveryDate: new Date('2024-01-20'),
        status: 'confirmed',
        items: [
          {
            id: '1',
            productName: 'Premium Widget Pro',
            productCode: 'WDG-PRO-001',
            quantity: 2,
            unitPrice: 500,
            discount: 0,
            total: 1000
          },
          {
            id: '2',
            productName: 'Standard Gadget Plus',
            productCode: 'GDG-STD-002',
            quantity: 3,
            unitPrice: 200,
            discount: 50,
            total: 550
          },
          {
            id: '3',
            productName: 'Basic Component Set',
            productCode: 'CMP-BSC-003',
            quantity: 1,
            unitPrice: 150,
            discount: 0,
            total: 150
          }
        ],
        subtotal: 1700,
        tax: 170,
        discount: 100,
        total: 1770,
        notes: 'Please deliver before 3 PM. Contact customer before delivery.',
        createdAt: new Date('2024-01-14'),
        updatedAt: new Date('2024-01-15')
      };
      this.isLoading = false;
    }, 500);
  }

  editOrder() {
    this.router.navigate(['/sales-order/edit', this.orderId]);
  }

  async showActions() {
    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Order Actions',
      buttons: [
        {
          text: 'Edit Order',
          icon: 'create-outline',
          handler: () => this.editOrder()
        },
        {
          text: 'Duplicate Order',
          icon: 'copy-outline',
          handler: () => this.duplicateOrder()
        },
        {
          text: 'Print Order',
          icon: 'print-outline',
          handler: () => this.printOrder()
        },
        {
          text: 'Share Order',
          icon: 'share-outline',
          handler: () => this.shareOrder()
        },
        {
          text: 'Delete Order',
          icon: 'trash-outline',
          role: 'destructive',
          handler: () => this.confirmDelete()
        },
        {
          text: 'Cancel',
          icon: 'close-outline',
          role: 'cancel'
        }
      ]
    });

    await actionSheet.present();
  }

  duplicateOrder() {
    this.router.navigate(['/sales-order/create'], {
      queryParams: { duplicate: this.orderId }
    });
  }

  async printOrder() {
    const toast = await this.toastCtrl.create({
      message: 'Preparing print preview...',
      duration: 2000,
      position: 'bottom'
    });
    await toast.present();
  }

  async shareOrder() {
    const toast = await this.toastCtrl.create({
      message: 'Share functionality coming soon',
      duration: 2000,
      position: 'bottom'
    });
    await toast.present();
  }

  async confirmDelete() {
    const alert = await this.alertCtrl.create({
      header: 'Delete Order',
      message: `Are you sure you want to delete order ${this.order?.orderNumber}?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => this.deleteOrder()
        }
      ]
    });

    await alert.present();
  }

  async deleteOrder() {
    // Replace with API call
    const toast = await this.toastCtrl.create({
      message: 'Order deleted successfully',
      duration: 2000,
      color: 'success',
      position: 'bottom'
    });
    await toast.present();

    this.router.navigate(['/sales-order/list']);
  }

  async updateStatus(newStatus: OrderStatus) {
    if (!this.order) return;

    const alert = await this.alertCtrl.create({
      header: 'Update Status',
      message: `Change status to "${this.statusLabels[newStatus]}"?`,
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel'
        },
        {
          text: 'Update',
          handler: async () => {
            // Replace with API call
            this.order!.status = newStatus;
            const toast = await this.toastCtrl.create({
              message: 'Status updated successfully',
              duration: 2000,
              color: 'success',
              position: 'bottom'
            });
            await toast.present();
          }
        }
      ]
    });

    await alert.present();
  }

  getStatusLabel(status: OrderStatus): string {
    return this.statusLabels[status];
  }

  getStatusColor(status: OrderStatus): string {
    return this.statusColors[status];
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(date));
  }

  callCustomer() {
    if (this.order?.customerPhone) {
      window.open(`tel:${this.order.customerPhone}`, '_system');
    }
  }

  emailCustomer() {
    if (this.order?.customerEmail) {
      window.open(`mailto:${this.order.customerEmail}`, '_system');
    }
  }
}
