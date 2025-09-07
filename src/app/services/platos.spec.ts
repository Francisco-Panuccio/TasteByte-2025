import { TestBed } from '@angular/core/testing';

import { Platos } from './platos.service';

describe('Platos', () => {
  let service: Platos;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Platos);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
