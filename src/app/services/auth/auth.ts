import { Injectable } from '@angular/core';
import { supabase } from '../../../supabase.client';

@Injectable({ providedIn: 'root' })
export class AuthService {
  signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  }

  signUp(email: string, password: string) {
    return supabase.auth.signUp({ email, password });
  }

  signOut() {
    return supabase.auth.signOut();
  }

  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error(error);
      return null;
    }
    return data.session;
  }

  onAuth(cb: Parameters<typeof supabase.auth.onAuthStateChange>[0]) {
    return supabase.auth.onAuthStateChange(cb);
  }

  async isAuthenticated(): Promise<boolean> {
    const session = await this.getSession();
    return !!session;
  }

  async getUser() {
    const session = await this.getSession();
    return session?.user;
  }

  async verifyPassword(password: string): Promise<boolean> {
    const session = await this.getSession();
    const email = session?.user?.email;
    if (!email) return false;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return !error;
  }

  // En auth.service.ts
async getCurrentUserPerfil(): Promise<string | null> {
  const session = await this.getSession();
  if (!session?.user?.id) {
    console.error("No se encontró una sesión de usuario.");
    return null;
  }
 
  const { data, error } = await supabase
    .from('usuarios')
    .select('perfil')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) {
    // Lanza el error para que el componente lo capture
    throw error;
  }

  return data?.perfil || null;
}



}