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
          // Intentar con signIn si setSession falla
          await this.tryAlternativeAuth(accessToken, refreshToken);
          return;
        }
        
        if (data.session) {
          console.log('✅ Sesión establecida, navegando al home...');
          await this.navigateToHome();
        } else {
          console.log('❌ setSession no devolvió sesión');
          await this.tryGetSession();
        }
      } else {
        console.log('❌ No hay tokens, intentando getSession...');
        await this.tryGetSession();
      }
      
    } catch (error) {
      console.error('💥 Error en handleAuthCallback:', error);
    }
  }

  private async tryAlternativeAuth(accessToken: string, refreshToken: string) {
    try {
      console.log('🔄 Intentando autenticación alternativa...');
      
      // Guardar tokens en localStorage como fallback
      localStorage.setItem('supabase.auth.token', accessToken);
      localStorage.setItem('supabase.auth.refreshToken', refreshToken);
      
      // Forzar refresh de sesión
      const { data, error } = await supabase.auth.refreshSession();
      
      if (data.session && !error) {
        console.log('✅ Sesión refrescada alternativamente');
        await this.navigateToHome();
      } else {
        console.log('❌ Fallback también falló');
      }
    } catch (error) {
      console.error('💥 Error en tryAlternativeAuth:', error);
    }
  }

  private async tryGetSession() {
    try {
      // Esperar y reintentar varias veces
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (session && !error) {
          console.log('✅ Sesión obtenida en intento', i + 1);
          await this.navigateToHome();
          return;
        }
        
        console.log('🔄 Intento', i + 1, 'sin sesión');
      }
      
      console.log('❌ No se pudo obtener sesión después de 3 intentos');
      
    } catch (error) {
      console.error('💥 Error en tryGetSession:', error);
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