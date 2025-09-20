import { TestBed } from '@angular/core/testing';

import { Asignaciones } from './asignaciones';

describe('Asignaciones', () => {
  let service: Asignaciones;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Asignaciones);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
