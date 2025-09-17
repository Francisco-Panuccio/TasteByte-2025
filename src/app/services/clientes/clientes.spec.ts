import { TestBed } from '@angular/core/testing';

import { Clientes } from './clientes';

describe('Clientes', () => {
  let service: Clientes;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Clientes);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
