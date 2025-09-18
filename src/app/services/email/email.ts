import { Injectable } from '@angular/core';
import { supabase } from 'src/supabase.client';

@Injectable({
  providedIn: 'root'
})
export class Email {

  async sendEmail(to: string, subject: string, template: string, vars: any): Promise<void> {
    console.log('📧 Attempting to send email to:', to);
    
    const { error } = await supabase.functions.invoke("send-email", {
      body: { 
        to: to.trim().toLowerCase(),
        subject: subject.trim(),
        template: template.trim(),
        vars 
      }
    });
    
    if (error) {
      console.error('❌ Email error:', error);
      throw error;
    }
    
    console.log('✅ Email sent successfully');
  }

}