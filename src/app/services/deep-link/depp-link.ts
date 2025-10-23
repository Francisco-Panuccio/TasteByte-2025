import { Injectable, NgZone } from '@angular/core';
import { App } from '@capacitor/app';
import { Router } from '@angular/router';
import { supabase } from 'src/supabase.client';
import { Capacitor } from '@capacitor/core';

@Injectable({
  providedIn: 'root'
})
export class DeepLinkService {
  private listenerInitialized = false;

  constructor(
    private router: Router,
    private ngZone: NgZone
  ) {}

  async initializeDeepLinkListener() {
    if (this.listenerInitialized || !Capacitor.isNativePlatform()) {
      return;
    }

    this.listenerInitialized = true;

    console.log('🔗 Inicializando listener de deep links...');
    
    App.addListener('appUrlOpen', async (event: any) => {
      console.log('🎯 Deep link recibido:', event.url);
      
      const url = event.url;
      
      if (url.includes('login-callback')) {
        console.log('✅ Es un callback de Google OAuth');
        await this.handleAuthCallback(url);
      }
    });
  }

  private async handleAuthCallback(url: string) {
    try {
      console.log('🔐 Procesando callback de autenticación...');
      
      let accessToken: string | null = null;
      let refreshToken: string | null = null;
      
      // Intentar extraer del hash (formato actual)
      try {
        const hashParams = new URL(url).hash.substring(1);
        const params = new URLSearchParams(hashParams);
        accessToken = params.get('access_token');
        refreshToken = params.get('refresh_token');
      } catch (e) {
        console.log('❌ Error parseando hash:', e);
      }
      
      // Si no se encontraron en el hash, intentar en query params (por si acaso)
      if (!accessToken || !refreshToken) {
        try {
          const urlObj = new URL(url);
          accessToken = urlObj.searchParams.get('access_token');
          refreshToken = urlObj.searchParams.get('refresh_token');
        } catch (e) {
          console.log('❌ Error parseando query params:', e);
        }
      }
      
      console.log('📋 Access token:', !!accessToken);
      console.log('📋 Refresh token:', !!refreshToken);
      
      if (accessToken && refreshToken) {
        console.log('✅ Estableciendo sesión con tokens...');
        
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        
        if (error) {
          console.error('❌ Error setSession:', error);
          return;
        }
        
        if (data.session) {
          console.log('✅ Sesión establecida, verificando usuario...');
          const userExists = await this.checkIfUserExists(data.session.user);
          
          if (userExists) {
            console.log('✅ Usuario existe, navegando al home...');
            await this.navigateToHome();
          } else {
            console.log('❌ Usuario no existe en la base de datos, cerrando sesión...');
            await supabase.auth.signOut();
            // No navegar - quedará en el login
          }
        } else {
          console.log('❌ setSession no devolvió sesión');
        }
      } else {
        console.log('❌ No hay tokens');
      }
      
    } catch (error) {
      console.error('💥 Error en handleAuthCallback:', error);
    }
  }

  private async checkIfUserExists(authUser: any): Promise<boolean> {
    try {
      const email = authUser.email;
      if (!email) return false;

      const { data: existingUser, error } = await supabase
        .from('usuarios')
        .select('id')
        .eq('correo_electronico', email)
        .maybeSingle();

      if (error) {
        console.error('❌ Error verificando usuario:', error);
        return false;
      }

      return !!existingUser;
    } catch (error) {
      console.error('💥 Error en checkIfUserExists:', error);
      return false;
    }
  }

  private async navigateToHome() {
    try {
      console.log('🏠 Navegando al home...');
      
      // Usar NgZone para asegurar la navegación en el contexto de Angular
      this.ngZone.run(() => {
        this.router.navigateByUrl('/home', { replaceUrl: true })
          .then(success => {
            console.log('✅ Navigate result:', success);
          })
          .catch(error => {
            console.error('❌ Navigate error:', error);
          });
      });
      
    } catch (error) {
      console.error('💥 Error navegando al home:', error);
    }
  }
}