import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CocinaPage } from './cocina.page';

describe('CocinaPage', () => {
  let component: CocinaPage;
  let fixture: ComponentFixture<CocinaPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(CocinaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
