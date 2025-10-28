import { inject, Injectable } from '@angular/core';
import { supabase } from 'src/supabase.client';
import { Push } from '../push/push';

export interface ReservaInput {
  fecha_hora: string; 
  invitados?: number;
}

@Injectable({ providedIn: 'root' })
export class ReservasService {
  private push = inject(Push);

async crearReserva(input: ReservaInput): Promise<{ id: string }> {
  const { data: au } = await supabase.auth.getUser();
  const email = au?.user?.email;
  if (!email) throw new Error('Debes iniciar sesión para realizar una reserva.');

  const { data: usuario, error: usuarioErr } = await supabase
    .from('usuarios')
    .select('nombres, apellidos, correo_electronico')
    .eq('correo_electronico', email)
    .maybeSingle();
  if (usuarioErr) throw usuarioErr;
  if (!usuario) throw new Error('Solo los clientes registrados pueden realizar reservas.');

  const fecha = new Date(input.fecha_hora);
  if (isNaN(+fecha)) throw new Error('La fecha de la reserva no es válida.');

  const ahora = new Date();
  const margenMinutos = 10;
  if (fecha.getTime() <= ahora.getTime() + margenMinutos * 60 * 1000) {
    throw new Error(`La reserva debe ser al menos ${margenMinutos} minutos en el futuro.`);
  }

  const maxFuturo = new Date();
  maxFuturo.setMonth(maxFuturo.getMonth() + 6);
  if (fecha > maxFuturo) {
    throw new Error('No se pueden reservar fechas con más de 6 meses de anticipación.');
  }

  const { data: existentes, error: errExist } = await supabase
    .from('reservas')
    .select('id, fecha_hora')
    .eq('usuario_correo', email);
  if (errExist) throw errExist;

  const existeMismoDiaYHora = (existentes ?? []).some((r) => {
    const existente = new Date(r.fecha_hora);
    return (
      existente.toDateString() === fecha.toDateString() &&
      Math.abs(existente.getTime() - fecha.getTime()) < 2 * 60 * 60 * 1000
    );
  });
  if (existeMismoDiaYHora) {
    throw new Error('Ya tienes una reserva registrada en un horario cercano de ese mismo día.');
  }

  const payload = {
    usuario_correo: email,
    fecha_hora: fecha.toISOString(),
    invitados: input.invitados ?? 2,
    estado: 'pendiente',
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('reservas')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw error;

  try {
    const nombre = `${usuario.nombres ?? ''} ${usuario.apellidos ?? ''}`.trim();
    const fechaLocal = fecha.toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Argentina/Buenos_Aires',
    });
    await this.push.sendToRoles(
      ['dueño', 'supervisor'],
      '📅 Nueva reserva pendiente',
      `${nombre || 'Un cliente'} solicitó una reserva para ${fechaLocal}`,
      {
        tipo: 'nueva_reserva',
        usuario_correo: email,
        reserva_id: data.id,
        fecha_hora: fechaLocal,
      }
    );
  } catch (err) {
    console.error('❌ Error al enviar push a dueño/supervisor:', err);
  }

  return { id: data.id as string };
}

  async listarMisReservas(): Promise<any[]> {
    const { data: au } = await supabase.auth.getUser();
    const email = au?.user?.email;

    if (!email) throw new Error('No se encontró sesión activa.');

    const { data, error } = await supabase
      .from('reservas')
      .select('*')
      .eq('usuario_correo', email)
      .order('fecha_hora', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }
}
