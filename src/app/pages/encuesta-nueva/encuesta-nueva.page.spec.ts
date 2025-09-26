import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EncuestaNuevaPage } from './encuesta-nueva.page';

describe('EncuestaNuevaPage', () => {
  let component: EncuestaNuevaPage;
  let fixture: ComponentFixture<EncuestaNuevaPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(EncuestaNuevaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
