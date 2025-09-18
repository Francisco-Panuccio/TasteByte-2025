import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PedidosMozoPage } from './pedidos-mozo.page';

describe('PedidosMozoPage', () => {
  let component: PedidosMozoPage;
  let fixture: ComponentFixture<PedidosMozoPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(PedidosMozoPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
