import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReservasAdminPage } from './reservas-admin.page';

describe('ReservasAdminPage', () => {
  let component: ReservasAdminPage;
  let fixture: ComponentFixture<ReservasAdminPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ReservasAdminPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
