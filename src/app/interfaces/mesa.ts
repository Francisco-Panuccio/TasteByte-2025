export type TipoMesa = "VIP" | "estándar" | "movilidad_reducida"

export interface Mesa {
  id?: number
  numero: number
  capacidad: number
  tipo: TipoMesa
  foto_url: string
  qr_contenido?: string|null
  qr_generado_en?: string|null
}