import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MesaOcupadaPage } from './mesa-ocupada.page';

describe('MesaOcupadaPage', () => {
  let component: MesaOcupadaPage;
  let fixture: ComponentFixture<MesaOcupadaPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(MesaOcupadaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
