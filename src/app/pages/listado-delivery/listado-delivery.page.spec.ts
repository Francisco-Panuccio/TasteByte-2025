import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListadoDeliveryPage } from './listado-delivery.page';

describe('ListadoDeliveryPage', () => {
  let component: ListadoDeliveryPage;
  let fixture: ComponentFixture<ListadoDeliveryPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ListadoDeliveryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
