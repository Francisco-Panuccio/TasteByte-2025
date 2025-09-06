import { TestBed } from '@angular/core/testing';

import { Mesas } from './mesas';

describe('Mesas', () => {
  let service: Mesas;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Mesas);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
