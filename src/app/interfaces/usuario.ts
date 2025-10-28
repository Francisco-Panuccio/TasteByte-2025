export interface Usuario {
  id: number;
  apellidos: string;
  nombres: string;
  numero_documento: number | null;
  numero_cuil: number | null;
  correo_electronico: string;
  perfil: string;
  foto_url: string | null;
  dni_qr_payload: string | null;
  dni_qr_leido_en: string | null;
}
