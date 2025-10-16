import { TestBed } from '@angular/core/testing';

import { SesionPushService } from './sesion-push-service';

describe('SesionPushService', () => {
  let service: SesionPushService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SesionPushService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
