import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EncuestasPage } from './encuestas.page';

describe('EncuestasPage', () => {
  let component: EncuestasPage;
  let fixture: ComponentFixture<EncuestasPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(EncuestasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
