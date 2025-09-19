import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AnonRegisterPage } from './anon-register.page';

describe('AnonRegisterPage', () => {
  let component: AnonRegisterPage;
  let fixture: ComponentFixture<AnonRegisterPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AnonRegisterPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
