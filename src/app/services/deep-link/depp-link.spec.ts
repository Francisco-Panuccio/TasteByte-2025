import { TestBed } from '@angular/core/testing';

import { DeppLink } from './depp-link';

describe('DeppLink', () => {
  let service: DeppLink;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DeppLink);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
