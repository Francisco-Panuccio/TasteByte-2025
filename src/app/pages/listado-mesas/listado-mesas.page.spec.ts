import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ListadoMesasPage } from './listado-mesas.page';

describe('ListadoMesasPage', () => {
  let component: ListadoMesasPage;
  let fixture: ComponentFixture<ListadoMesasPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ListadoMesasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
