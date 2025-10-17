import { TestBed } from '@angular/core/testing';

import { ClienteSessionService } from './cliente-session-service';

describe('ClienteSessionService', () => {
  let service: ClienteSessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ClienteSessionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
