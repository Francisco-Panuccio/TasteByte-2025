import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormErrorsPage } from './form-errors.page';

describe('FormErrorsPage', () => {
  let component: FormErrorsPage;
  let fixture: ComponentFixture<FormErrorsPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(FormErrorsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
