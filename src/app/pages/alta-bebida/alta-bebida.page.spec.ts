import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AltaBebidaPage } from './alta-bebida.page';

describe('AltaBebidaPage', () => {
  let component: AltaBebidaPage;
  let fixture: ComponentFixture<AltaBebidaPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AltaBebidaPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
