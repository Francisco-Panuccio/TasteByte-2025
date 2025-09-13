import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Splash } from './splash.page';

describe('SplashPage', () => {
  let component: Splash;
  let fixture: ComponentFixture<Splash>;

  beforeEach(() => {
    fixture = TestBed.createComponent(Splash);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
