import { Component } from '@angular/core';
import { AuthService } from '../../services/auth';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage {

  constructor(private auth : AuthService, private router : Router) {}

  async logOut() {
    try {
      const anyAuth = this.auth as any;
      if (typeof anyAuth.signOut === 'function') {
        await anyAuth.signOut({ scope: 'local' });
      } else if (typeof anyAuth.signOutLocal === 'function') {
        await anyAuth.signOutLocal();
      }
    } catch { }

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)!;
        if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
          localStorage.removeItem(k);
          i--;
        }
      }

      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)!;
        if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
          sessionStorage.removeItem(k);
          i--;
        }
      }
    } catch { }

    this.router.navigateByUrl('/login', { replaceUrl: true });
  }
}



