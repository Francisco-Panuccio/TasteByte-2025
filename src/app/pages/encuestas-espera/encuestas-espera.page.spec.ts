import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EncuestasEsperaPage } from './encuestas-espera.page';

describe('EncuestasEsperaPage', () => {
  let component: EncuestasEsperaPage;
  let fixture: ComponentFixture<EncuestasEsperaPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(EncuestasEsperaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
