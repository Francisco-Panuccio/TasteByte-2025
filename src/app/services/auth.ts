import { Injectable } from '@angular/core';
import { supabase } from '../../supabase.client';

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
}