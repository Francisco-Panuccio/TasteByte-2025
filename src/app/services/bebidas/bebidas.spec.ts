import { TestBed } from '@angular/core/testing';

import { Bebidas } from './bebidas';

describe('Bebidas', () => {
  let service: Bebidas;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Bebidas);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
