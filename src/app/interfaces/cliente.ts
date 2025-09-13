
export interface Cliente {
  id?: number;
  nombres: string;
  apellidos: string;
  dni: string;
  cuil?: string | null;
  correo: string;
  clave: string;
  perfil: 'cliente' | 'maitre';
  foto: string;
  estado: 'pendiente' | 'aprobado' | 'rechazado';
  creado_en?: string;
  actualizado_en?: string;
}
