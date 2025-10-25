import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PedidosDeliveryPage } from './pedidos-delivery.page';

describe('PedidosDeliveryPage', () => {
  let component: PedidosDeliveryPage;
  let fixture: ComponentFixture<PedidosDeliveryPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PedidosDeliveryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
