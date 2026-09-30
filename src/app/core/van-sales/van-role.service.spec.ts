import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Role } from './van-sales.models';
import { VanRoleService } from './van-role.service';
import { VanStoreService } from './van-store.service';

describe('VanRoleService — who sees customer balances', () => {
  const role = signal<Role>('VAN_SELLER');

  beforeEach(() => {
    localStorage.removeItem('gp.vanSales.devRole');
    TestBed.configureTestingModule({
      providers: [{ provide: VanStoreService, useValue: { repSetup: computed(() => ({ role: role(), deliveryCanTakeOrders: false })) } }],
    });
  });

  const sees = (r: Role) => {
    role.set(r);
    return TestBed.inject(VanRoleService).seesBalance();
  };

  it('hides balances from the van seller and the pre-seller', () => {
    expect(sees('VAN_SELLER')).toBeFalse();
    expect(sees('PRE_SELLER')).toBeFalse();
  });

  it('shows balances to the roles that manage credit', () => {
    expect(sees('COLLECTOR')).toBeTrue();
    expect(sees('DELIVERY_REP')).toBeTrue();
    expect(sees('SUPERVISOR')).toBeTrue();
  });

  it('still lets the van seller collect', () => {
    role.set('VAN_SELLER');
    expect(TestBed.inject(VanRoleService).can('COLLECT')).toBeTrue();
  });
});
