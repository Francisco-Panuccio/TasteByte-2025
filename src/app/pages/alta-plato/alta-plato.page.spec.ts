import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AltaPlatoPage } from './alta-plato.page';

describe('AltaPlatoPage', () => {
  let component: AltaPlatoPage;
  let fixture: ComponentFixture<AltaPlatoPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AltaPlatoPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
