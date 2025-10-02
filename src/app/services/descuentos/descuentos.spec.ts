import { TestBed } from '@angular/core/testing';

import { Descuentos } from './descuentos';

describe('Descuentos', () => {
  let service: Descuentos;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Descuentos);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
